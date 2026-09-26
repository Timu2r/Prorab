import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/migrations";
import { CLIENT, doWork, invoice, OWNER, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

describe("заявка с сайта без входа (правило 11)", () => {
  const lead = { name: "Ольга", phone: "8 999 000-00-07", category: "facade", comment: "Штукатурка фасада, 120 м²", consent: true };

  it("попадает владельцу как новая с меткой рекламы; клиент потом входит и видит её", async () => {
    const r = await t.call("POST", "/public/leads", undefined, { ...lead, utm: { utm_source: "yandex", utm_campaign: "fasad" } });
    expect(r.status).toBe(201);
    expect(r.body.number).toMatch(/^Z-\d{4}$/);
    const owner = await t.login(OWNER);
    const [req] = (await t.call("GET", "/requests", owner)).body.requests;
    expect(req).toMatchObject({ source: "site", status: "new", category: "facade", client: { name: "Ольга", phone: "+79990000007" } });
    expect((await t.call("GET", `/requests/${req.id}`, owner)).body.request.utm).toEqual({ utm_source: "yandex", utm_campaign: "fasad" });
    const client = await t.login("+79990000007");
    expect((await t.call("GET", "/requests", client)).body.requests).toHaveLength(1);
  });

  it("без согласия не принимается; бот с полем-ловушкой ничего не создаёт", async () => {
    expect((await t.call("POST", "/public/leads", undefined, { ...lead, consent: false })).status).toBe(400);
    expect((await t.call("POST", "/public/leads", undefined, { ...lead, website: "http://spam" })).status).toBe(201);
    const owner = await t.login(OWNER);
    expect((await t.call("GET", "/requests", owner)).body.requests).toEqual([]);
  });

  it("не больше 3 заявок в сутки с номера и 5 в час с адреса", async () => {
    for (let i = 0; i < 3; i++)
      expect((await t.app.inject({ method: "POST", url: "/public/leads", payload: lead, remoteAddress: `10.0.0.${i}` })).statusCode).toBe(201);
    expect((await t.app.inject({ method: "POST", url: "/public/leads", payload: lead, remoteAddress: "10.0.0.9" })).statusCode).toBe(429);
    for (let i = 0; i < 5; i++) await t.call("POST", "/public/leads", undefined, { ...lead, phone: `+7999000011${i}` });
    expect((await t.call("POST", "/public/leads", undefined, { ...lead, phone: "+79990000120" })).status).toBe(429);
  });
});

describe("прайс", () => {
  it("63 работы с ценами рынок + 10%; владелец меняет цены направления на процент", async () => {
    const owner = await t.login(OWNER);
    const list = (await t.call("GET", "/services")).body.services;
    expect(list).toHaveLength(63); // материалы и оборудование на сайте только в расчёте калькулятора
    expect(list.some((s: { id: string }) => s.id.startsWith("svc_mat-"))).toBe(false);
    expect(list.find((s: { id: string }) => s.id === "svc_climate-mount-small").price).toBe(1_100_000);
    await t.call("POST", "/admin/services/reprice", owner, { percent: 10, category: "climate" });
    const after = (await t.call("GET", "/services")).body.services;
    expect(after.find((s: { id: string }) => s.id === "svc_climate-mount-small").price).toBe(1_200_000); // 12 100 -> 12 000
    expect(after.find((s: { id: string }) => s.id === "svc_plumbing-mixer").price).toBe(170_000); // другое направление не тронуто
  });

  it("миграция наценки не трогает цену, которую владелец уже поменял", async () => {
    const owner = await t.login(OWNER);
    await t.call("PATCH", "/admin/services/svc_climate-service", owner, { price: 450_000 });
    await t.db.query(`DELETE FROM migrations WHERE id = 4`);
    await t.db.query(`UPDATE services SET price = 300000 WHERE id = 'svc_climate-freon'`);
    await migrate(t.db);
    const list = (await t.call("GET", "/services")).body.services as { id: string; price: number }[];
    expect(list.find((s) => s.id === "svc_climate-service")!.price).toBe(450_000);
    expect(list.find((s) => s.id === "svc_climate-freon")!.price).toBe(330_000);
  });
});

describe("клиенты", () => {
  it("список с поиском по номеру, профиль компании, история заявок", async () => {
    const s = await scene(t);
    const found = (await t.call("GET", "/admin/clients?q=0003", s.owner)).body.clients;
    expect(found).toHaveLength(1);
    const c = (await t.call("PATCH", `/admin/clients/${found[0].id}`, s.owner, { type: "company", companyName: "ООО Ромашка", note: "Платит быстро" })).body
      .client;
    expect(c).toMatchObject({ type: "company", companyName: "ООО Ромашка", note: "Платит быстро", requests: 1 });
    expect(c.history[0].total).toBe(1_100_000);
    expect(CLIENT).toBe("+79990000003");
  });
});

describe("сводка, отчёты, настройки", () => {
  it("«требует внимания»: новая заявка без ответа и мастер без ответа", async () => {
    const s = await scene(t);
    await t.call("POST", "/public/leads", undefined, { name: "Иван", phone: "+79990000150", category: "electric", consent: true });
    await t.db.query(`UPDATE requests SET created_at = now() - interval '1 hour' WHERE source = 'site'`);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    await t.db.query(`UPDATE request_events SET at = now() - interval '2 hours' WHERE kind = 'assigned'`);
    const d = (await t.call("GET", "/admin/dashboard", s.owner)).body.dashboard;
    const kinds = d.attention.map((a: { kind: string }) => a.kind);
    expect(kinds).toContain("new_waiting");
    expect(kinds).toContain("no_answer");
  });

  it("визиты на сегодня и итоги месяца по закрытой заявке", async () => {
    const s = await scene(t);
    await t.call("PATCH", `/requests/${s.id}`, s.owner, { visitAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await t.call("PATCH", `/requests/${s.id}`, s.owner, { visitAt: new Date().toISOString(), visitUntil: new Date(Date.now() - 3_600_000).toISOString() })).body.error.code).toBe("bad_visit");
    await doWork(t, s);
    await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: true });
    await invoice(t, s, "works");
    await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "closed" });
    const d = (await t.call("GET", "/admin/dashboard", s.owner)).body.dashboard;
    expect(d.today.map((v: { number: string }) => v.number)).toContain("Z-0001");
    expect(d.month).toMatchObject({ newRequests: 1, closed: 1, cashIn: 1_100_000, result: { revenue: 1_100_000, payouts: 550_000, tax: 66_000, profit: 484_000 } });
    const money = (await t.call("GET", "/admin/reports/money", s.owner)).body.report;
    expect(money.categories).toEqual([{ category: "climate", count: 1, revenue: 1_100_000, goodsCost: 0, payouts: 550_000, tax: 66_000, profit: 484_000 }]);
    const funnel = (await t.call("GET", "/admin/reports/funnel", s.owner)).body.report;
    expect(funnel.sources).toEqual([{ source: "app", created: 1, agreed: 1, closed: 1, cancelled: 0 }]);
  });

  it("настройки: вложенные группы дополняются, налог влияет на расчёт", async () => {
    const owner = await t.login(OWNER);
    const s1 = (await t.call("PATCH", "/admin/settings", owner, { attention: { newMinutes: 5 }, taxPercent: 4 })).body.settings;
    expect(s1.attention).toMatchObject({ newMinutes: 5, noAnswerMinutes: 30 });
    expect(s1.taxPercent).toBe(4);
    expect(s1.notifyOwnerPhones).toEqual([OWNER]);
    expect((await t.call("PATCH", "/admin/settings", owner, { notifyOwnerPhones: ["8999"] })).status).toBe(400);
  });
});
