import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT, MASTER, OWNER, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

describe("вход по коду", () => {
  it("владелец получает роль по номеру из настроек", async () => {
    const token = await t.login(OWNER);
    expect((await t.call("GET", "/me", token)).body.user.roles).toEqual(["client", "owner"]);
  });

  it("новый номер становится клиентом", async () => {
    const token = await t.login("8 (999) 000-00-09");
    expect((await t.call("GET", "/me", token)).body.user).toMatchObject({ phone: "+79990000009", roles: ["client"] });
  });

  it("после 5 неверных кодов код блокируется", async () => {
    await t.call("POST", "/auth/code", undefined, { phone: CLIENT });
    for (let i = 0; i < 5; i++) expect((await t.call("POST", "/auth/verify", undefined, { phone: CLIENT, code: "xxxx" })).status).toBe(400);
    const right = t.sent.at(-1)!.code;
    expect((await t.call("POST", "/auth/verify", undefined, { phone: CLIENT, code: right })).body.error.code).toBe("code_locked");
  });

  it("код одноразовый, повторный — не раньше чем через минуту", async () => {
    await t.call("POST", "/auth/code", undefined, { phone: CLIENT });
    expect((await t.call("POST", "/auth/code", undefined, { phone: CLIENT })).body.error.code).toBe("too_soon");
    const code = t.sent.at(-1)!.code;
    expect((await t.call("POST", "/auth/verify", undefined, { phone: CLIENT, code })).status).toBe(200);
    expect((await t.call("POST", "/auth/verify", undefined, { phone: CLIENT, code })).status).toBe(400);
  });

  it("код не отдаётся в ответе при выключенном DEV_CODES; городской номер не принимается", async () => {
    expect((await t.call("POST", "/auth/code", undefined, { phone: CLIENT })).body.devCode).toBeUndefined();
    expect((await t.call("POST", "/auth/code", undefined, { phone: "+7 495 123-45-67" })).status).toBe(400);
  });

  it("после выхода токен не работает", async () => {
    const token = await t.login(CLIENT);
    await t.call("POST", "/auth/logout", token);
    expect((await t.call("GET", "/me", token)).status).toBe(401);
  });
});

describe("профиль", () => {
  it("клиент-компания сохраняет название и ИНН", async () => {
    const token = await t.login(CLIENT);
    const r = await t.call("PATCH", "/me", token, { name: "Ольга", type: "company", companyName: "ООО Ромашка", inn: "7700000000" });
    expect(r.body.user).toMatchObject({ name: "Ольга", profile: { type: "company", companyName: "ООО Ромашка", inn: "7700000000" } });
    expect((await t.call("PATCH", "/me", token, { inn: "123" })).status).toBe(400);
  });
});

describe("удаление аккаунта (правило 13)", () => {
  it("имя и телефон обезличиваются, заявки остаются у владельца", async () => {
    const s = await scene(t);
    expect((await t.call("DELETE", "/me", s.client, {})).status).toBe(400); // без подтверждения
    expect((await t.call("DELETE", "/me", s.client, { confirm: true })).status).toBe(200);
    expect((await t.call("GET", "/me", s.client)).status).toBe(401);
    const r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.client.name).toBe("");
    expect(r.client.phone).toMatch(/^deleted:/);
    // По тому же номеру можно зарегистрироваться заново — это уже новый человек (минута между кодами уже прошла)
    await t.db.query(`UPDATE login_codes SET created_at = now() - interval '2 minutes'`);
    const again = await t.login(CLIENT);
    expect((await t.call("GET", "/requests", again)).body.requests).toEqual([]);
  });

  it("владельца удалить нельзя; мастера с заданием — тоже", async () => {
    const s = await scene(t);
    expect((await t.call("DELETE", "/me", s.owner, { confirm: true })).body.error.code).toBe("owner");
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    expect((await t.call("DELETE", "/me", s.master, { confirm: true })).body.error.code).toBe("active_jobs");
    expect(MASTER).toBeTruthy();
  });
});
