import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doWork, invoice, scene, setup, teardown, type Scene, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

async function closeJob(s: Scene) {
  await doWork(t, s);
  await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: true });
  await invoice(t, s, "full");
  const r = await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "closed" });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.request;
}

describe("выплаты мастеру (правило 8)", () => {
  it("процент: при закрытии начисляется 50% от работ, заработок по заявке считается по факту", async () => {
    const s = await scene(t, { materials: true });
    const r = await closeJob(s);
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0]).toMatchObject({ amount: 550_000, status: "accrued", needsAmount: false });
    // выручка 15 500 ₽; материалы по факту 4 м × 700 ₽ = 2 800 ₽; мастеру 5 500 ₽; налог 6% = 930 ₽
    expect(r.money).toEqual({ revenue: 1_550_000, goodsCost: 280_000, payouts: 550_000, tax: 93_000, profit: 627_000 });
  });

  it("фиксированный прайс без нужной позиции — «уточнить сумму», без суммы не выплатить", async () => {
    const s = await scene(t);
    await t.call("POST", `/admin/masters/${s.masterId}/rates`, s.owner, { mode: "fixed", prices: { "svc_climate-service": 150_000 }, validFrom: "2026-02-01" });
    const r = await closeJob(s);
    const p = r.payouts[0];
    expect(p).toMatchObject({ amount: 0, needsAmount: true });
    expect((await t.call("POST", `/payouts/${p.id}/paid`, s.owner, { method: "bank" })).body.error.code).toBe("needs_amount");
    await t.call("PATCH", `/payouts/${p.id}`, s.owner, { amount: 600_000 });
    expect((await t.call("POST", `/payouts/${p.id}/paid`, s.owner, { method: "bank" })).body.payout.status).toBe("paid");
  });

  it("мастер видит только свои выплаты и итоги; добавляет чек самозанятого", async () => {
    const s = await scene(t);
    await closeJob(s);
    let mine = (await t.call("GET", "/payouts", s.master)).body;
    expect(mine.totals).toEqual({ accrued: 550_000, paid: 0, toPay: 550_000 });
    const id = mine.payouts[0].id;
    expect((await t.call("POST", `/payouts/${id}/receipt`, s.master, { url: "https://lknpd.nalog.ru/api/v1/receipt/1/print" })).body.error.code).toBe("not_paid");
    await t.call("POST", `/payouts/${id}/paid`, s.owner, { method: "bank" });
    expect((await t.call("GET", "/payouts", s.master)).body.payouts[0].receiptMissing).toBe(true);
    await t.call("POST", `/payouts/${id}/receipt`, s.master, { url: "https://lknpd.nalog.ru/api/v1/receipt/1/print" });
    mine = (await t.call("GET", "/payouts", s.master)).body;
    expect(mine.payouts[0].receiptMissing).toBe(false);
    expect(mine.totals).toEqual({ accrued: 550_000, paid: 550_000, toPay: 0 });
    // Чек фото тоже принимается
    const res = await t.upload(`/payouts/${id}/receipt`, s.master);
    expect(res.body.payout.receiptFileUrl).toContain("/files/");
    // Владелец отмечает выплаты, мастер — нет
    expect((await t.call("POST", `/payouts/${id}/paid`, s.master, { method: "bank" })).status).toBe(403);
  });

  it("удержание записывается с минусом и только с причиной", async () => {
    const s = await scene(t);
    expect((await t.call("POST", "/payouts", s.owner, { masterId: s.masterId, kind: "deduction", amount: 100_000, reason: "" })).status).toBe(400);
    const p = (await t.call("POST", "/payouts", s.owner, { masterId: s.masterId, kind: "deduction", amount: 100_000, reason: "Переделка дренажа" })).body.payout;
    expect(p.amount).toBe(-100_000);
    expect((await t.call("GET", "/payouts", s.master)).body.totals.toPay).toBe(-100_000);
  });
});
