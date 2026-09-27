import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OWNER, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

/** Порядок владельца (2026-09-27): выезд на объект → договор и аванс лично → мастер → покупки по ходу работ. */
describe("выезд прораба и договор лично", () => {
  it("выезд на объект виден клиенту и попадает владельцу в «Сегодня»", async () => {
    const owner = await t.login(OWNER);
    const client = await t.login("+79990000310");
    const r = await t.call("POST", "/requests", client, { category: "floors", address: "Москва, Ленинский, 5" });
    const id: string = r.body.request.id;
    // Сегодня по Москве, 13:00–15:00
    const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const surveyAt = `${day}T10:00:00.000Z`;
    const surveyUntil = `${day}T12:00:00.000Z`;
    const patched = await t.call("PATCH", `/requests/${id}`, owner, { surveyAt, surveyUntil });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect((await t.call("PATCH", `/requests/${id}`, owner, { surveyUntil: `${day}T09:00:00.000Z` })).body.error.code).toBe("bad_visit");

    const c = (await t.call("GET", `/requests/${id}`, client)).body.request;
    expect(new Date(c.surveyAt).toISOString()).toBe(surveyAt);
    const today = (await t.call("GET", "/admin/dashboard", owner)).body.dashboard.today;
    expect(today).toContainEqual(expect.objectContaining({ kind: "survey", id }));
  });

  it("клиент согласился лично — договор «на бумаге при встрече»", async () => {
    const owner = await t.login(OWNER);
    const client = await t.login("+79990000311");
    const id: string = (await t.call("POST", "/requests", client, { category: "electric", address: "Москва, Тверская, 7" })).body.request.id;
    const est = (await t.call("POST", `/requests/${id}/estimates`, owner)).body.estimate;
    await t.call("PUT", `/estimates/${est.id}/items`, owner, { items: [{ kind: "work", serviceId: null, name: "Розетка", unit: "pcs", qty: 2, price: 50_000 }] });
    expect((await t.call("POST", `/estimates/${est.id}/approve`, owner, { method: "paper" })).status).toBe(200);
    expect((await t.call("GET", `/requests/${id}`, client)).body.request.contract).toMatchObject({ method: "paper" });
  });
});

describe("покупки мастера по ходу работ", () => {
  async function onSite() {
    const s = await scene(t);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    for (const to of ["accepted", "en_route", "on_site"]) await t.call("POST", `/requests/${s.id}/status`, s.master, { to });
    return s;
  }

  it("«нужно купить» — прорабу во «Требует внимания», он отмечает «куплено»", async () => {
    const s = await onSite();
    const added = await t.call("POST", `/requests/${s.id}/purchases`, s.master, { kind: "need", text: "Кабель ВВГ 3×2,5 — 5 м" });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const p = added.body.purchases[0];
    expect(p).toMatchObject({ kind: "need", status: "open", amount: null });

    const attention = (await t.call("GET", "/admin/dashboard", s.owner)).body.dashboard.attention;
    expect(attention).toContainEqual(expect.objectContaining({ kind: "purchase_need", requestId: s.id }));

    expect((await t.call("POST", `/purchases/${p.id}/resolve`, s.master, { status: "done" })).status).toBe(403);
    expect((await t.call("POST", `/purchases/${p.id}/resolve`, s.owner, { status: "approved" })).body.error.code).toBe("bad_status");
    const done = await t.call("POST", `/purchases/${p.id}/resolve`, s.owner, { status: "done" });
    expect(done.body.purchases[0].status).toBe("done");
    expect((await t.call("POST", `/purchases/${p.id}/resolve`, s.owner, { status: "done" })).body.error.code).toBe("resolved");
  });

  it("«купил сам» с чеком — прораб подтверждает, мастеру начисляется возмещение; клиент покупок не видит", async () => {
    const s = await onSite();
    expect((await t.call("POST", `/requests/${s.id}/purchases`, s.master, { kind: "bought", text: "Дюбели" })).status).toBe(400); // без суммы
    const receipt = await t.upload(`/requests/${s.id}/files?kind=receipt`, s.master);
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    const added = await t.call("POST", `/requests/${s.id}/purchases`, s.master, { kind: "bought", text: "Дюбели и хомуты", amount: 64_000, fileId: receipt.body.file.id });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    const p = added.body.purchases[0];
    expect(p.receiptUrl).toEqual(expect.any(String));

    // Прораб поправил сумму по чеку
    const ok = await t.call("POST", `/purchases/${p.id}/resolve`, s.owner, { status: "approved", amount: 62_000 });
    expect(ok.body.purchases[0]).toMatchObject({ status: "approved", payoutId: expect.any(String) });
    const payouts = (await t.call("GET", "/payouts", s.master)).body.payouts as { kind: string; amount: number; status: string }[];
    expect(payouts).toContainEqual(expect.objectContaining({ kind: "expense", amount: 62_000, status: "accrued" }));

    const master = (await t.call("GET", `/requests/${s.id}`, s.master)).body.request;
    expect(master.purchases).toHaveLength(1);
    const client = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(client).not.toHaveProperty("purchases");
  });

  it("о покупках сообщает только мастер задания и только во время работы", async () => {
    const s = await scene(t);
    expect((await t.call("POST", `/requests/${s.id}/purchases`, s.owner, { kind: "need", text: "Кабель" })).status).toBe(403);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    expect((await t.call("POST", `/requests/${s.id}/purchases`, s.master, { kind: "need", text: "Кабель" })).status).toBe(409); // ещё не принял
  });
});
