import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import type { CodeSender } from "../src/auth";
import { openDb, type Db } from "../src/db";
import { migrate } from "../src/migrations";

const OWNER = "+79990000001";
const MASTER = "+79990000002";
const CLIENT = "+79990000003";
const OTHER = "+79990000004";

let db: Db;
let app: FastifyInstance;
const sent: { phone: string; code: string }[] = [];
const sender: CodeSender = { send: async (phone, code) => void sent.push({ phone, code }) };

beforeEach(async () => {
  sent.length = 0;
  db = await openDb({});
  await migrate(db);
  app = await buildApp(db, sender, { ownerPhones: [OWNER], devCodes: false, codeSecret: "test", webOrigins: [], trustProxy: false });
});
afterEach(async () => {
  await app.close();
  await db.close();
});

async function call(method: "GET" | "POST" | "PATCH", url: string, token?: string, payload?: object) {
  const res = await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.statusCode, body: res.json() };
}

async function login(phone: string, ip = "1.1.1.1"): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/auth/code", payload: { phone }, remoteAddress: ip });
  expect(res.statusCode).toBe(200);
  const normalized: string = res.json().phone;
  const code = sent.findLast((s) => s.phone === normalized)!.code;
  const v = await call("POST", "/auth/verify", undefined, { phone, code });
  expect(v.status).toBe(200);
  return v.body.token;
}

/** Владелец, мастер, клиент и заявка клиента, согласованная и назначенная мастеру. */
async function scene() {
  const owner = await login(OWNER);
  const m = await call("POST", "/admin/masters", owner, { phone: MASTER, name: "Азиз", skills: ["climate"], taxStatus: "npd" });
  expect(m.status).toBe(200);
  const master = await login(MASTER);
  const client = await login(CLIENT);
  const r = await call("POST", "/requests", client, { category: "climate", address: "Москва, ул. Ленина, 1, кв. 5", district: "Хамовники" });
  expect(r.status).toBe(201);
  const id: string = r.body.request.id;
  await call("PATCH", `/requests/${id}`, owner, { priceWork: 2_500_000, priceGoods: 4_500_000 });
  await call("POST", `/requests/${id}/status`, owner, { to: "agreed" });
  const a = await call("POST", `/requests/${id}/assign`, owner, { masterId: m.body.master.id });
  expect(a.body.request.status).toBe("assigned");
  return { owner, master, client, id, masterId: m.body.master.id as string };
}

describe("вход по коду", () => {
  it("владелец получает роль по номеру из настроек", async () => {
    const t = await login(OWNER);
    const me = await call("GET", "/me", t);
    expect(me.body.user.roles).toEqual(["client", "owner"]);
  });

  it("новый номер становится клиентом", async () => {
    const t = await login("8 (999) 000-00-05");
    expect((await call("GET", "/me", t)).body.user).toMatchObject({ phone: "+79990000005", roles: ["client"] });
  });

  it("неверный код не пускает, после 5 ошибок код блокируется", async () => {
    await call("POST", "/auth/code", undefined, { phone: CLIENT });
    for (let i = 0; i < 5; i++) expect((await call("POST", "/auth/verify", undefined, { phone: CLIENT, code: "xxxx" })).status).toBe(400);
    const right = sent.at(-1)!.code;
    expect((await call("POST", "/auth/verify", undefined, { phone: CLIENT, code: right })).body.error.code).toBe("code_locked");
  });

  it("код одноразовый", async () => {
    await call("POST", "/auth/code", undefined, { phone: CLIENT });
    const code = sent.at(-1)!.code;
    expect((await call("POST", "/auth/verify", undefined, { phone: CLIENT, code })).status).toBe(200);
    expect((await call("POST", "/auth/verify", undefined, { phone: CLIENT, code })).status).toBe(400);
  });

  it("повторный код не раньше чем через минуту", async () => {
    await call("POST", "/auth/code", undefined, { phone: CLIENT });
    expect((await call("POST", "/auth/code", undefined, { phone: CLIENT })).body.error.code).toBe("too_soon");
  });

  it("код не отдаётся в ответе, если DEV_CODES выключен", async () => {
    expect((await call("POST", "/auth/code", undefined, { phone: CLIENT })).body.devCode).toBeUndefined();
  });

  it("городской номер не принимается", async () => {
    expect((await call("POST", "/auth/code", undefined, { phone: "+7 495 123-45-67" })).status).toBe(400);
  });

  it("после выхода токен не работает", async () => {
    const t = await login(CLIENT);
    await call("POST", "/auth/logout", t);
    expect((await call("GET", "/me", t)).status).toBe(401);
  });
});

describe("права", () => {
  it("без входа закрыто всё, кроме прайса", async () => {
    expect((await call("GET", "/services")).status).toBe(200);
    expect((await call("GET", "/requests")).status).toBe(401);
    expect((await call("GET", "/admin/masters")).status).toBe(401);
  });

  it("клиент и мастер не попадают в кабинет владельца", async () => {
    const { client, master } = await scene();
    for (const t of [client, master]) {
      expect((await call("GET", "/admin/masters", t)).status).toBe(403);
      expect((await call("POST", "/admin/services", t, { category: "climate", name: "Взлом", unit: "pcs" })).status).toBe(403);
    }
  });

  it("клиент не видит чужую заявку", async () => {
    const { id } = await scene();
    const other = await login(OTHER);
    expect((await call("GET", `/requests/${id}`, other)).status).toBe(404);
    expect((await call("GET", "/requests", other)).body.requests).toEqual([]);
  });

  it("мастер не видит цену клиента, а контакты — только после принятия", async () => {
    const { master, id } = await scene();
    const before = (await call("GET", `/requests/${id}`, master)).body.request;
    expect(before.priceWork).toBeUndefined();
    expect(before.priceGoods).toBeUndefined();
    expect(before.address).toBeNull();
    expect(before.client).toBeNull();
    expect(before.district).toBe("Хамовники");

    await call("POST", `/requests/${id}/status`, master, { to: "accepted" });
    const after = (await call("GET", `/requests/${id}`, master)).body.request;
    expect(after.client.phone).toBe(CLIENT);
    expect(after.address).toContain("Ленина");
    expect(after.priceWork).toBeUndefined();
  });

  it("мастер не может закрыть заявку, клиент не может отменить после выезда", async () => {
    const { master, client, owner, id } = await scene();
    for (const to of ["accepted", "en_route"]) await call("POST", `/requests/${id}/status`, master, { to });
    expect((await call("POST", `/requests/${id}/status`, client, { to: "cancelled", reason: "передумал" })).status).toBe(409);
    for (const to of ["on_site", "done"]) await call("POST", `/requests/${id}/status`, master, { to });
    expect((await call("POST", `/requests/${id}/status`, master, { to: "act_signed" })).status).toBe(409);
    expect((await call("POST", `/requests/${id}/status`, client, { to: "act_signed" })).status).toBe(200);
    expect((await call("POST", `/requests/${id}/status`, master, { to: "paid" })).status).toBe(409);
    for (const to of ["paid", "closed"]) expect((await call("POST", `/requests/${id}/status`, owner, { to })).status).toBe(200);
  });

  it("чужой мастер не видит и не двигает заявку", async () => {
    const { owner, id } = await scene();
    await call("POST", "/admin/masters", owner, { phone: OTHER, name: "Другой", skills: ["climate"], taxStatus: "ip" });
    const other = await login(OTHER);
    expect((await call("GET", `/requests/${id}`, other)).status).toBe(404);
    expect((await call("POST", `/requests/${id}/status`, other, { to: "accepted" })).status).toBe(404);
  });

  it("отмена только с причиной", async () => {
    const { client, id } = await scene();
    expect((await call("POST", `/requests/${id}/status`, client, { to: "cancelled" })).body.error.code).toBe("reason_required");
    expect((await call("POST", `/requests/${id}/status`, client, { to: "cancelled", reason: "нашёл дешевле" })).body.request.status).toBe("cancelled");
  });

  it("согласовать без цены нельзя", async () => {
    const owner = await login(OWNER);
    const r = await call("POST", "/requests", owner, { category: "electric", address: "Москва, ул. Мира, 10", clientPhone: CLIENT, clientName: "Иван" });
    expect(r.body.request.source).toBe("call");
    expect((await call("POST", `/requests/${r.body.request.id}/status`, owner, { to: "agreed" })).body.error.code).toBe("price_required");
  });
});

describe("мастер отказался", () => {
  it("заявка возвращается туда, где была, и мастер её больше не видит", async () => {
    const { master, owner, id } = await scene();
    expect((await call("POST", `/requests/${id}/unassign`, master, { reason: "занят" })).status).toBe(200);
    const r = (await call("GET", `/requests/${id}`, owner)).body.request;
    expect(r.status).toBe("agreed");
    expect(r.master).toBeNull();
    expect(r.events.map((e: { kind: string }) => e.kind)).toContain("declined");
    expect((await call("GET", `/requests/${id}`, master)).status).toBe(404);
  });

  it("после предоплаты возвращается в «Предоплата получена»", async () => {
    const owner = await login(OWNER);
    const m = await call("POST", "/admin/masters", owner, { phone: MASTER, name: "Азиз", skills: ["climate"], taxStatus: "npd" });
    const r = await call("POST", "/requests", owner, { category: "climate", address: "Москва, ул. Мира, 10", clientPhone: CLIENT });
    const id = r.body.request.id;
    await call("PATCH", `/requests/${id}`, owner, { priceWork: 1_000_000 });
    for (const to of ["agreed", "invoiced", "prepaid"]) await call("POST", `/requests/${id}/status`, owner, { to });
    await call("POST", `/requests/${id}/assign`, owner, { masterId: m.body.master.id });
    const master = await login(MASTER);
    await call("POST", `/requests/${id}/unassign`, master, {});
    expect((await call("GET", `/requests/${id}`, owner)).body.request.status).toBe("prepaid");
  });
});

describe("мастера и ставки", () => {
  it("ставка мастера: действует последняя вступившая в силу", async () => {
    const owner = await login(OWNER);
    const m = (await call("POST", "/admin/masters", owner, { phone: MASTER, name: "Отец", skills: ["climate", "vent"], taxStatus: "npd", inn: "123456789012" })).body.master;
    await call("POST", `/admin/masters/${m.id}/rates`, owner, { mode: "percent", percent: 50, validFrom: "2026-01-01" });
    await call("POST", `/admin/masters/${m.id}/rates`, owner, { mode: "percent", percent: 60, validFrom: "2099-01-01" });
    expect((await call("GET", `/admin/masters/${m.id}`, owner)).body.master.rate).toMatchObject({ mode: "percent", percent: 50 });
  });

  it("неверный ИНН не принимается", async () => {
    const owner = await login(OWNER);
    const r = await call("POST", "/admin/masters", owner, { phone: MASTER, name: "Отец", skills: ["climate"], taxStatus: "npd", inn: "123" });
    expect(r.status).toBe(400);
  });

  it("прайс: 56 позиций на старте, цена задаётся владельцем", async () => {
    const owner = await login(OWNER);
    const list = (await call("GET", "/services")).body.services;
    expect(list).toHaveLength(56);
    // рыночные цены «от» проставлены всем позициям
    expect(list.every((s: { price: number | null }) => s.price !== null)).toBe(true);
    expect(list.find((s: { id: string }) => s.id === "svc_climate-mount-small").price).toBe(1_100_000); // 9 900 ₽ рынок + 10% = 10 890 -> 11 000
    const s = await call("PATCH", `/admin/services/${list[0].id}`, owner, { price: 1_500_000 });
    expect(s.body.service.price).toBe(1_500_000);
    expect((await call("GET", "/services")).body.services[0].price).toBe(1_500_000);
  });
});

describe("заявка с сайта без входа", () => {
  const lead = { name: "Ольга", phone: "8 999 000-00-07", category: "facade", comment: "Штукатурка фасада, 120 м²", consent: true };

  it("попадает владельцу как новая заявка с сайта", async () => {
    const r = await call("POST", "/public/leads", undefined, lead);
    expect(r.status).toBe(201);
    expect(r.body.number).toMatch(/^Z-\d{4}$/);
    const owner = await login(OWNER);
    const [req] = (await call("GET", "/requests", owner)).body.requests;
    expect(req).toMatchObject({ source: "site", status: "new", category: "facade", client: { name: "Ольга", phone: "+79990000007" } });
  });

  it("клиент потом входит по коду и видит свою заявку", async () => {
    await call("POST", "/public/leads", undefined, lead);
    const client = await login("+79990000007");
    expect((await call("GET", "/requests", client)).body.requests).toHaveLength(1);
  });

  it("без согласия на обработку данных не принимается", async () => {
    const r = await call("POST", "/public/leads", undefined, { ...lead, consent: false });
    expect(r.status).toBe(400);
  });

  it("бот, заполнивший поле-ловушку, заявку не создаёт", async () => {
    const r = await call("POST", "/public/leads", undefined, { ...lead, website: "http://spam" });
    expect(r.status).toBe(201);
    const owner = await login(OWNER);
    expect((await call("GET", "/requests", owner)).body.requests).toEqual([]);
  });

  it("не больше трёх заявок в сутки с одного номера", async () => {
    for (let i = 0; i < 3; i++) expect((await app.inject({ method: "POST", url: "/public/leads", payload: lead, remoteAddress: `10.0.0.${i}` })).statusCode).toBe(201);
    const r = await app.inject({ method: "POST", url: "/public/leads", payload: lead, remoteAddress: "10.0.0.9" });
    expect(r.statusCode).toBe(429);
  });

  it("не больше пяти заявок в час с одного адреса", async () => {
    for (let i = 0; i < 5; i++) await call("POST", "/public/leads", undefined, { ...lead, phone: `+7999000011${i}` });
    expect((await call("POST", "/public/leads", undefined, { ...lead, phone: "+79990000120" })).status).toBe(429);
  });
});

describe("миграции цен", () => {
  it("наценка не трогает цену, которую владелец уже поменял", async () => {
    const owner = await login(OWNER);
    await call("PATCH", "/admin/services/svc_climate-service", owner, { price: 450_000 });
    // Имитируем базу, где миграция 4 ещё не выполнялась и стоит рыночная цена
    await db.query(`DELETE FROM migrations WHERE id = 4`);
    await db.query(`UPDATE services SET price = 300000 WHERE id = 'svc_climate-freon'`);
    const { migrate: run } = await import("../src/migrations");
    await run(db);
    const list = (await call("GET", "/services")).body.services as { id: string; price: number }[];
    expect(list.find((s) => s.id === "svc_climate-service")!.price).toBe(450_000); // своя цена осталась
    expect(list.find((s) => s.id === "svc_climate-freon")!.price).toBe(330_000); // рыночная 3 000 -> 3 300
  });
});
