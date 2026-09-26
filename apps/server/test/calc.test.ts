import { CALCULATORS, normalizeAnswers } from "@ks/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT, MASTER, OWNER, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

const lead = { name: "Ольга", phone: "+79990000200", category: "general", consent: true };

type Line = { name: string; qty: number; price: number; kind: string; serviceId: string };

describe("калькулятор на сайте", () => {
  it("прайс для калькулятора: работы, материалы и оборудование с ключами, без закупочных цен", async () => {
    const items = (await t.call("GET", "/public/calculator")).body.items as { key: string; kind: string; price: number }[];
    const copper = items.find((i) => i.key === "mat-copper-14")!;
    expect(copper).toMatchObject({ kind: "material", price: 45_000 });
    expect(copper).not.toHaveProperty("cost");
    expect(items.find((i) => i.key === "eq-split-small")!.kind).toBe("equipment");
    expect(items.find((i) => i.key === "climate-extra-pipe")!.price).toBe(99_000); // метр трассы теперь только работа
  });

  it("заявка с расчётом: сервер считает сам, ответы и черновик сметы видны владельцу", async () => {
    const answers = { job: "install", small: 1, route: "known", length: 15, duct: true };
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, address: "Москва, Профсоюзная, 12", calc: { id: "climate", answers } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.number).toBe("Z-0001");

    const owner = await t.login(OWNER);
    const [item] = (await t.call("GET", "/requests", owner)).body.requests;
    const r = (await t.call("GET", `/requests/${item.id}`, owner)).body.request;
    expect(r.category).toBe("climate");
    expect(r.address).toBe("Москва, Профсоюзная, 12");
    expect(r.calc.answers).toEqual(normalizeAnswers(CALCULATORS.climate, answers));
    expect(r.calc.totals.total).toBe(res.body.total);
    expect(r.description).toContain("Длина трассы на один кондиционер: 15 м");
    expect(r.description).not.toContain("₽"); // описание видят мастера — цены клиента в нём нет (правило 1)

    const [est] = r.estimates;
    expect(est).toMatchObject({ version: 1, status: "draft" });
    const lines = est.items as Line[];
    const copper = lines.find((l) => l.serviceId === "svc_mat-copper-14")!;
    expect(copper).toMatchObject({ kind: "material", qty: 20, price: 45_000 }); // 15 м + 5 м запаса
    expect(lines.find((l) => l.serviceId === "svc_climate-duct")!.qty).toBe(20);
    expect(est.totals.total).toBe(res.body.total);
  });

  it("цены с сайта не принимаются, а новая цена в прайсе сразу меняет расчёт", async () => {
    const owner = await t.login(OWNER);
    await t.call("PATCH", "/admin/services/svc_mat-copper-14", owner, { price: 50_000 });
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, calc: { id: "climate", answers: { small: 1, price: 1 } } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [item] = (await t.call("GET", "/requests", owner)).body.requests;
    const r = (await t.call("GET", `/requests/${item.id}`, owner)).body.request;
    expect(r.calc.answers).not.toHaveProperty("price");
    const copper = (r.estimates[0].items as Line[]).find((l) => l.serviceId === "svc_mat-copper-14")!;
    expect(copper).toMatchObject({ qty: 25, price: 50_000 }); // длину не знает — 25 м
  });

  it("неизвестный калькулятор — ошибка, обычная заявка без расчёта — как раньше", async () => {
    expect((await t.call("POST", "/public/leads", undefined, { ...lead, calc: { id: "space", answers: {} } })).status).toBe(400);
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, comment: "Повесить полку" });
    expect(res.body).toEqual({ number: "Z-0001", total: null });
  });
});

describe("договор с клиентом", () => {
  it("клиент без согласия с договором смету не согласует; с согласием — договор заключён онлайн", async () => {
    const s = await scene(t); // в сцене клиент соглашается с договором
    const r = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(r.contract).toMatchObject({ number: "Z-0001", method: "online", priceWork: 1_100_000, priceGoods: 0 });
    expect(r.contract.client.phone).toBe(CLIENT);
    expect(r.contract.address).toBe("Москва, ул. Ленина, 1, кв. 5");

    // Новая версия сметы договор не меняет и повторного согласия не требует
    const v2 = (await t.call("POST", `/requests/${s.id}/estimates`, s.owner)).body.estimate;
    await t.call("POST", `/estimates/${v2.id}/send`, s.owner);
    expect((await t.call("POST", `/estimates/${v2.id}/approve`, s.client)).status).toBe(200);
    const events = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request.events as { kind: string }[];
    expect(events.filter((e) => e.kind === "contract")).toHaveLength(1);
  });

  it("первое согласование клиентом без галочки — ошибка", async () => {
    const owner = await t.login(OWNER);
    const client = await t.login(CLIENT);
    const r = (await t.call("POST", "/requests", client, { category: "electric", address: "Москва, ул. Мира, 10" })).body.request;
    const est = (await t.call("POST", `/requests/${r.id}/estimates`, owner)).body.estimate;
    await t.call("PUT", `/estimates/${est.id}/items`, owner, { items: [{ kind: "work", name: "Розетка", unit: "point", qty: 2, price: 50_000 }] });
    await t.call("POST", `/estimates/${est.id}/send`, owner);
    const no = await t.call("POST", `/estimates/${est.id}/approve`, client);
    expect(no.body.error.code).toBe("contract_required");
    expect((await t.call("GET", `/requests/${r.id}`, client)).body.request.contract).toBeNull();
  });

  it("владелец отмечает «согласовано по телефону» — договор заключён по телефону", async () => {
    const owner = await t.login(OWNER);
    const r = (await t.call("POST", "/requests", owner, { category: "electric", address: "Москва, ул. Мира, 10", clientPhone: CLIENT, clientName: "Иван" })).body.request;
    const est = (await t.call("POST", `/requests/${r.id}/estimates`, owner)).body.estimate;
    await t.call("PUT", `/estimates/${est.id}/items`, owner, { items: [{ kind: "work", name: "Розетка", unit: "point", qty: 2, price: 50_000 }] });
    expect((await t.call("POST", `/estimates/${est.id}/approve`, owner)).status).toBe(200);
    const detail = (await t.call("GET", `/requests/${r.id}`, owner)).body.request;
    expect(detail.status).toBe("agreed");
    expect(detail.contract).toMatchObject({ method: "phone", priceWork: 100_000 });
  });
});

describe("мастер: «принимаю заказы»", () => {
  it("мастер выключает приём заказов — владелец видит это в списке; клиенту отметка недоступна", async () => {
    const owner = await t.login(OWNER);
    const m = (await t.call("POST", "/admin/masters", owner, { phone: MASTER, name: "Азиз", skills: ["climate"], taxStatus: "npd" })).body.master;
    expect(m.available).toBe(true);
    const master = await t.login(MASTER);
    expect((await t.call("GET", "/me", master)).body.user.available).toBe(true);
    expect((await t.call("PUT", "/me/availability", master, { available: false })).body).toEqual({ available: false });
    expect((await t.call("GET", "/me", master)).body.user.available).toBe(false);

    const list = (await t.call("GET", "/admin/masters", owner)).body.masters;
    expect(list[0]).toMatchObject({ available: false, activeJobs: 0, todayVisits: 0, nextVisitAt: null });
    expect(list[0].availableAt).not.toBeNull();

    const client = await t.login(CLIENT);
    expect((await t.call("PUT", "/me/availability", client, { available: true })).status).toBe(403);
    expect((await t.call("GET", "/me", client)).body.user.available).toBeNull();

    // Владелец тоже может включить мастеру приём заказов
    expect((await t.call("PATCH", `/admin/masters/${m.id}`, owner, { available: true })).body.master.available).toBe(true);
  });
});
