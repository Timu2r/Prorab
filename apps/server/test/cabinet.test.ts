import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shortName } from "../src/requests";
import { MASTER, OWNER, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

const PHONE = "+79990000300";
const lead = { name: "Ольга", phone: PHONE, category: "general", consent: true };
const ids = (list: { id: string }[]) => list.map((r) => r.id).sort();

/** Кабинет клиента появляется сам после заявки (docs/TZ.md, 16.4). */
describe("ключ браузера после заявки", () => {
  it("без кода видна только заявка с этого браузера и только на просмотр", async () => {
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, type: "consult", comment: "Нужна консультация" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const key: string = res.body.access;
    expect(key).toEqual(expect.any(String));
    expect((await t.call("GET", "/me", key)).body.user).toMatchObject({ phone: PHONE, name: "", roles: [], scope: "device" });

    // Заявку на тот же номер владелец завёл по звонку — без кода её не видно
    const owner = await t.login(OWNER);
    const byCall = await t.call("POST", "/requests", owner, { category: "electric", address: "Москва, Тверская, 1", clientPhone: PHONE, clientName: "Ольга" });
    expect(byCall.status, JSON.stringify(byCall.body)).toBe(201);

    expect(ids((await t.call("GET", "/requests", key)).body.requests)).toEqual([res.body.id]);
    const r = (await t.call("GET", `/requests/${res.body.id}`, key)).body.request;
    expect(r).toMatchObject({ number: res.body.number, canAct: false, phone: PHONE, team: [] });
    expect((await t.call("GET", `/requests/${byCall.body.request.id}`, key)).status).toBe(404);

    // Менять ничего нельзя: ни имя, ни аккаунт, ни заявки
    for (const [method, url, payload] of [
      ["PATCH", "/me", { name: "Чужой" }],
      ["DELETE", "/me", { confirm: true }],
      ["GET", "/requests/mine", undefined],
      ["POST", `/requests/${res.body.id}/status`, { to: "cancelled", reason: "передумал" }],
    ] as const) {
      const denied = await t.call(method, url, key, payload);
      expect(denied.status, `${method} ${url}`).toBe(403);
      expect(denied.body.error.code).toBe("confirm_phone");
    }
  });

  it("номер владельца в заявке не открывает панель владельца", async () => {
    const owner = await t.login(OWNER);
    await t.call("POST", "/requests", owner, { category: "floors", address: "Москва, Арбат, 2", clientPhone: "+79990000301", clientName: "Другой клиент" });
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, phone: OWNER });
    const key = res.body.access;
    expect((await t.call("GET", "/me", key)).body.user.roles).toEqual([]);
    expect((await t.call("GET", "/admin/dashboard", key)).status).toBe(403);
    expect(ids((await t.call("GET", "/requests", key)).body.requests)).toEqual([res.body.id]);
  });

  it("вторая заявка с того же браузера добавляется к ключу — даже на другой номер", async () => {
    const first = await t.call("POST", "/public/leads", undefined, lead);
    const key = first.body.access;
    const second = await t.call("POST", "/public/leads", key, { ...lead, name: "Мама", phone: "+79990000301" });
    expect(second.status).toBe(201);
    expect(second.body.access).toBeNull();
    expect(ids((await t.call("GET", "/requests", key)).body.requests)).toEqual([first.body.id, second.body.id].sort());
  });

  it("вход по коду закрывает ключ; заявки с браузера остаются, действовать можно только со своей", async () => {
    const mine = await t.call("POST", "/public/leads", undefined, lead);
    const key = mine.body.access;
    const mom = await t.call("POST", "/public/leads", key, { ...lead, name: "Мама", phone: "+79990000301" });

    // Как на сайте: подтверждение номера идёт с ключом в заголовке
    expect((await t.call("POST", "/auth/code", key, { phone: PHONE })).status).toBe(200);
    const code = t.sent.findLast((x) => x.phone === PHONE)!.code;
    const v = await t.call("POST", "/auth/verify", key, { phone: PHONE, code });
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    const full: string = v.body.token;
    expect((await t.call("GET", "/me", key)).status).toBe(401);
    expect((await t.call("GET", "/me", full)).body.user.scope).toBe("full");

    expect(ids((await t.call("GET", "/requests", full)).body.requests)).toEqual([mine.body.id, mom.body.id].sort());
    expect((await t.call("GET", `/requests/${mine.body.id}`, full)).body.request.canAct).toBe(true);
    expect((await t.call("GET", `/requests/${mom.body.id}`, full)).body.request.canAct).toBe(false);
  });

  it("смету без кода видно, но согласовать нельзя", async () => {
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, calc: { id: "climate", answers: { small: 1 } } });
    const key = res.body.access;
    const owner = await t.login(OWNER);
    const est = (await t.call("GET", `/requests/${res.body.id}`, owner)).body.request.estimates[0];
    expect((await t.call("POST", `/estimates/${est.id}/send`, owner)).status).toBe(200);

    expect((await t.call("GET", `/requests/${res.body.id}`, key)).body.request.estimates[0].status).toBe("sent");
    const denied = await t.call("POST", `/estimates/${est.id}/approve`, key, { acceptContract: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("confirm_phone");
  });

  it("договор без кода — только номер и дата, без данных владельца номера", async () => {
    const res = await t.call("POST", "/public/leads", undefined, { ...lead, calc: { id: "climate", answers: { small: 1 } } });
    const owner = await t.login(OWNER);
    const est = (await t.call("GET", `/requests/${res.body.id}`, owner)).body.request.estimates[0];
    expect((await t.call("POST", `/estimates/${est.id}/approve`, owner)).status).toBe(200); // по телефону
    const view = (await t.call("GET", `/requests/${res.body.id}`, res.body.access)).body.request;
    expect(view.contract).toEqual({ number: expect.any(String), method: "phone", acceptedAt: expect.any(String) });
  });

  it("«Выйти на этом устройстве» закрывает ключ", async () => {
    const key = (await t.call("POST", "/public/leads", undefined, lead)).body.access;
    expect((await t.call("POST", "/auth/logout", key)).status).toBe(200);
    expect((await t.call("GET", "/requests", key)).status).toBe(401);
  });
});

describe("кто работает по заявке", () => {
  it("прораб — владелец, первым взявшийся за заявку; мастер — после подтверждения, без телефона", async () => {
    const s = await scene(t);
    let r = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(r.foreman).toMatchObject({ phone: OWNER });
    expect(r.team).toEqual([]);
    expect((await t.call("GET", `/requests/${s.id}`, s.owner)).body.request.foreman).toMatchObject({ id: expect.any(String) });

    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    r = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(r.team).toEqual([]); // назначен, но ещё не подтвердил — мастер может смениться
    expect(r.master).toBeNull();

    for (const to of ["accepted", "en_route"]) await t.call("POST", `/requests/${s.id}/status`, s.master, { to });
    r = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(r.team).toEqual([{ name: "Азиз", role: "Мастер", area: "Кондиционеры", state: "en_route" }]);
    expect(JSON.stringify(r)).not.toContain(MASTER); // телефон мастера клиенту не отдаём
  });

  it("клиенту — имя и первая буква фамилии", () => {
    expect(shortName("Азиз Рахимов")).toBe("Азиз Р.");
    expect(shortName("  Олег   Никитин ")).toBe("Олег Н.");
    expect(shortName("Сергей")).toBe("Сергей");
    expect(shortName("")).toBe("");
  });
});
