import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLIENT, doWork, invoice, scene, setup, status, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

describe("смета", () => {
  it("клиент утверждает смету — заявка сама становится «Согласована», суммы попадают в заявку", async () => {
    const s = await scene(t, { materials: true });
    const r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.status).toBe("agreed");
    expect(r.priceWork).toBe(1_100_000);
    expect(r.priceGoods).toBe(450_000);
    expect(r.estimates[0].totals).toMatchObject({ work: 1_100_000, goods: 450_000, total: 1_550_000, cost: 350_000 });
  });

  it("без утверждённой сметы согласовать нельзя", async () => {
    const owner = await t.login("+79990000001");
    const r = await t.call("POST", "/requests", owner, { category: "electric", address: "Москва, ул. Мира, 10", clientPhone: CLIENT, clientName: "Иван" });
    expect(r.body.request.source).toBe("call");
    expect((await t.call("POST", `/requests/${r.body.request.id}/status`, owner, { to: "agreed" })).body.error.code).toBe("estimate_required");
  });

  it("правило 5: утверждённую смету не поменять — только новая версия со своим согласованием", async () => {
    const s = await scene(t);
    const items = [{ kind: "work", name: "Монтаж", unit: "pcs", qty: 1, price: 1 }];
    expect((await t.call("PUT", `/estimates/${s.estimateId}/items`, s.owner, { items })).body.error.code).toBe("not_draft");

    const v2 = (await t.call("POST", `/requests/${s.id}/estimates`, s.owner)).body.estimate;
    expect(v2.version).toBe(2);
    expect(v2.items).toHaveLength(1); // копия первой версии
    expect((await t.call("POST", `/requests/${s.id}/estimates`, s.owner)).body.error.code).toBe("draft_exists");
    const more = [...v2.items, { kind: "work", serviceId: "svc_climate-extra-pipe", name: "Трасса сверх стандартной", unit: "m", qty: 2, price: 200_000 }];
    await t.call("PUT", `/estimates/${v2.id}/items`, s.owner, { items: more });
    await t.call("POST", `/estimates/${v2.id}/send`, s.owner);
    await t.call("POST", `/estimates/${v2.id}/approve`, s.client);

    const list = (await t.call("GET", `/requests/${s.id}/estimates`, s.owner)).body.estimates;
    expect(list.map((e: { status: string }) => e.status)).toEqual(["superseded", "approved"]);
    expect((await t.call("GET", `/requests/${s.id}`, s.owner)).body.request.priceWork).toBe(1_500_000);
  });

  it("клиент не видит черновиков и закупочных цен; отклоняет с причиной", async () => {
    const s = await scene(t, { materials: true });
    const v2 = (await t.call("POST", `/requests/${s.id}/estimates`, s.owner)).body.estimate;
    let list = (await t.call("GET", `/requests/${s.id}/estimates`, s.client)).body.estimates;
    expect(list).toHaveLength(1);
    expect(list[0].totals.cost).toBeUndefined();
    expect(list[0].items.every((i: object) => !("cost" in i))).toBe(true);
    await t.call("POST", `/estimates/${v2.id}/send`, s.owner);
    expect((await t.call("POST", `/estimates/${v2.id}/reject`, s.client, {})).body.error.code).toBe("reason_required");
    expect((await t.call("POST", `/estimates/${v2.id}/reject`, s.client, { reason: "Дорого" })).status).toBe(200);
    list = (await t.call("GET", `/requests/${s.id}/estimates`, s.client)).body.estimates;
    expect(list.map((e: { status: string }) => e.status)).toEqual(["approved", "rejected"]);
  });

  it("владелец согласует «по телефону» сразу из черновика", async () => {
    const owner = await t.login("+79990000001");
    const r = await t.call("POST", "/requests", owner, { category: "plumbing", address: "Москва, ул. Мира, 10", clientPhone: CLIENT });
    const est = (await t.call("POST", `/requests/${r.body.request.id}/estimates`, owner)).body.estimate;
    expect((await t.call("POST", `/estimates/${est.id}/approve`, owner)).body.error.code).toBe("empty");
    await t.call("PUT", `/estimates/${est.id}/items`, owner, { items: [{ kind: "work", serviceId: "svc_plumbing-mixer", name: "Смеситель", unit: "pcs", qty: 1, price: 170_000 }] });
    expect((await t.call("POST", `/estimates/${est.id}/approve`, owner)).status).toBe(200);
    expect((await t.call("GET", `/requests/${r.body.request.id}`, owner)).body.request.status).toBe("agreed");
  });
});

describe("счета и предоплата (правила 6, 7)", () => {
  it("счёт на материалы: сумма из сметы, после отправки — «Счёт выставлен», после оплаты — «Предоплата получена»", async () => {
    const s = await scene(t, { materials: true });
    const inv = (await t.call("POST", `/requests/${s.id}/invoices`, s.owner, { kind: "materials" })).body.invoice;
    expect(inv).toMatchObject({ amount: 450_000, number: "Z-0001-1", status: "draft" });
    expect((await t.call("PATCH", `/invoices/${inv.id}`, s.owner, { paymentUrl: "ftp://x" })).status).toBe(400);
    await t.call("PATCH", `/invoices/${inv.id}`, s.owner, { paymentUrl: "https://pay.example/materials" });
    await t.call("POST", `/invoices/${inv.id}/send`, s.owner);
    expect(await status(t, s)).toBe("invoiced");
    // Клиент видит счёт со ссылкой, черновики — нет
    const c = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(c.invoices).toHaveLength(1);
    expect(c.invoices[0].paymentUrl).toBe("https://pay.example/materials");
    await t.call("POST", `/invoices/${inv.id}/paid`, s.owner, { bankRef: "A-1" });
    expect(await status(t, s)).toBe("prepaid");
    expect((await t.call("POST", `/invoices/${inv.id}/paid`, s.owner)).body.error.code).toBe("not_sent");
  });

  it("счёт при встрече: без ссылки банка, клиент видит сумму, прораб отмечает оплату (docs/TZ.md, 16.5)", async () => {
    const s = await scene(t, { materials: true });
    const inv = (await t.call("POST", `/requests/${s.id}/invoices`, s.owner, { kind: "materials", amount: 300_000 })).body.invoice;
    expect((await t.call("POST", `/invoices/${inv.id}/send`, s.owner)).status).toBe(200);
    const c = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(c.invoices[0]).toMatchObject({ amount: 300_000, status: "sent", paymentUrl: "" });
    expect((await t.call("POST", `/invoices/${inv.id}/paid`, s.owner)).status).toBe(200);
    expect(await status(t, s)).toBe("prepaid");
  });

  it("мастер отказался после предоплаты — заявка возвращается в «Предоплата получена»", async () => {
    const s = await scene(t, { materials: true });
    await invoice(t, s, "materials");
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    expect((await t.call("POST", `/requests/${s.id}/unassign`, s.master, { reason: "занят" })).status).toBe(200);
    const r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.status).toBe("prepaid");
    expect(r.master).toBeNull();
    expect(r.events.map((e: { kind: string }) => e.kind)).toContain("declined");
    expect((await t.call("GET", `/requests/${s.id}`, s.master)).status).toBe(404);
  });

  it("владелец снимает мастера после «Принять» — заявка возвращается в «Согласована»", async () => {
    const s = await scene(t);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "accepted" });
    const r = await t.call("POST", `/requests/${s.id}/unassign`, s.owner, { reason: "Клиент перенёс" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.result).toMatchObject({ status: "agreed", master: null });
  });

  it("«Оплачена» — только когда подписан акт, есть счёт на работы и оплачены все счета", async () => {
    const s = await scene(t);
    await doWork(t, s);
    await invoice(t, s, "works", false);
    await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: true });
    expect(await status(t, s)).toBe("act_signed");
    expect((await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "paid" })).body.error.code).toBe("payment_required");
    const [inv] = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request.invoices;
    await t.call("POST", `/invoices/${inv.id}/paid`, s.owner);
    expect(await status(t, s)).toBe("paid");
  });

  it("если счёт оплатили до приёмки, после приёмки заявка сразу «Оплачена»", async () => {
    const s = await scene(t);
    await doWork(t, s);
    await invoice(t, s, "full");
    await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: true });
    expect(await status(t, s)).toBe("paid");
  });
});

describe("работа мастера (правило 4)", () => {
  it("«Готово» нельзя без фото до и после и без расхода материалов", async () => {
    const s = await scene(t, { materials: true });
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    for (const to of ["accepted", "en_route", "on_site"]) await t.call("POST", `/requests/${s.id}/status`, s.master, { to });
    expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "done" })).body.error.code).toBe("photos_required");
    await t.upload(`/requests/${s.id}/files?kind=before`, s.master);
    await t.upload(`/requests/${s.id}/files?kind=after`, s.master);
    expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "done" })).body.error.code).toBe("materials_required");
    expect((await t.call("PATCH", `/requests/${s.id}/materials`, s.master, { items: [{ itemId: "itm_fake", usedQty: 1 }] })).body.error.code).toBe("bad_item");
    await t.call("PATCH", `/requests/${s.id}/materials`, s.master, { items: [{ itemId: s.materialId, usedQty: 4 }] });
    expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "done" })).status).toBe(200);
  });

  it("доп. работы: мастер сообщает с фото, владелец видит в карточке", async () => {
    const s = await scene(t);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    expect((await t.call("POST", `/requests/${s.id}/extra-work`, s.master, { text: "Нужна помпа" })).status).toBe(409); // ещё не принял
    await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "accepted" });
    const f = (await t.upload(`/requests/${s.id}/files?kind=extra_work`, s.master)).body.file;
    expect((await t.call("POST", `/requests/${s.id}/extra-work`, s.master, { text: "Нужна дренажная помпа", fileIds: [f.id] })).status).toBe(200);
    const r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.extraWork).toHaveLength(1);
    expect(r.extraWork[0].text).toBe("Нужна дренажная помпа");
    expect(r.extraWork[0].files[0].url).toContain("/files/");
  });
});

describe("приёмка", () => {
  it("замечания клиента оставляют статус «Работы выполнены», причина обязательна", async () => {
    const s = await scene(t);
    await doWork(t, s);
    expect((await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: false })).body.error.code).toBe("remarks_required");
    await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: false, remarks: "Капает конденсат" });
    const r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.status).toBe("done");
    expect(r.acts[0]).toMatchObject({ accepted: false, remarks: "Капает конденсат" });
  });

  it("бумажный акт: мастер фотографирует, владелец принимает", async () => {
    const s = await scene(t);
    await doWork(t, s);
    const f = (await t.upload(`/requests/${s.id}/files?kind=act_paper`, s.master)).body.file;
    expect((await t.call("POST", `/requests/${s.id}/act-paper`, s.owner, { fileId: "fil_nope" })).body.error.code).toBe("bad_file");
    await t.call("POST", `/requests/${s.id}/act-paper`, s.owner, { fileId: f.id });
    expect(await status(t, s)).toBe("act_signed");
  });

  it("закрытие: гарантия на 12 месяцев, оценку клиент ставит только после закрытия", async () => {
    const s = await scene(t);
    await doWork(t, s);
    await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: true });
    expect((await t.call("POST", `/requests/${s.id}/review`, s.client, { rating: 5 })).body.error.code).toBe("not_closed");
    await invoice(t, s, "works");
    await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "closed" });
    const r = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    const year = new Date().getFullYear() + 1;
    expect(r.warrantyUntil.startsWith(String(year))).toBe(true);
    expect(r.files.map((f: { kind: string }) => f.kind)).toEqual(["before", "after"]); // клиент видит фото результата
    expect((await t.call("POST", `/requests/${s.id}/review`, s.client, { rating: 5, text: "Спасибо" })).status).toBe(200);
  });
});

describe("отмена (правила 9, 10)", () => {
  it("клиент отменяет только до выезда мастера и только с причиной", async () => {
    const s = await scene(t);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    for (const to of ["accepted", "en_route"]) await t.call("POST", `/requests/${s.id}/status`, s.master, { to });
    expect((await t.call("POST", `/requests/${s.id}/status`, s.client, { to: "cancelled", reason: "передумал" })).status).toBe(409);
    expect((await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "cancelled" })).body.error.code).toBe("reason_required");
    expect((await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "cancelled", reason: "Клиент не открыл" })).status).toBe(200);
  });

  it("отмена после предоплаты требует возврата; возврат снимает флаг", async () => {
    const s = await scene(t, { materials: true });
    const inv = await invoice(t, s, "materials");
    await t.call("POST", `/requests/${s.id}/status`, s.client, { to: "cancelled", reason: "Нашёл дешевле" });
    let r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.refundRequired).toBe(true);
    await t.call("POST", `/invoices/${inv}/cancel`, s.owner);
    r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.refundRequired).toBe(false);
    expect(r.invoices[0].status).toBe("refunded");
  });
});
