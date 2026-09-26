import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doWork, invoice, OTHER, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

describe("права по ролям", () => {
  it("без входа закрыто всё, кроме прайса", async () => {
    expect((await t.call("GET", "/services")).status).toBe(200);
    expect((await t.call("GET", "/requests")).status).toBe(401);
    expect((await t.call("GET", "/admin/masters")).status).toBe(401);
    expect((await t.call("GET", "/payouts")).status).toBe(401);
  });

  it("клиент и мастер не попадают в раздел владельца", async () => {
    const s = await scene(t);
    for (const token of [s.client, s.master]) {
      for (const url of ["/admin/masters", "/admin/clients", "/admin/dashboard", "/admin/settings", "/admin/reports/money"])
        expect((await t.call("GET", url, token)).status, url).toBe(403);
      expect((await t.call("POST", "/admin/services", token, { category: "climate", name: "Взлом", unit: "pcs" })).status).toBe(403);
    }
  });

  it("клиент не видит чужую заявку", async () => {
    const s = await scene(t);
    const other = await t.login(OTHER);
    expect((await t.call("GET", `/requests/${s.id}`, other)).status).toBe(404);
    expect((await t.call("GET", `/requests/${s.id}/estimates`, other)).status).toBe(404);
    expect((await t.call("GET", "/requests", other)).body.requests).toEqual([]);
  });

  it("правило 1: мастер не получает цен клиента ни в списке, ни в карточке, ни в смете", async () => {
    const s = await scene(t, { materials: true });
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    const [item] = (await t.call("GET", "/requests", s.master)).body.requests;
    const card = (await t.call("GET", `/requests/${s.id}`, s.master)).body.request;
    for (const v of [item, card]) {
      expect(v.priceWork).toBeUndefined();
      expect(v.priceGoods).toBeUndefined();
      expect(v.estimates).toBeUndefined();
      expect(v.invoices).toBeUndefined();
    }
    expect(card.pay).toBe(550_000); // 50% от монтажа 11 000 ₽
    expect(card.works).toEqual([{ name: "Монтаж сплит-системы", unit: "pcs", qty: 1 }]);
    expect(card.materials[0]).toEqual({ id: s.materialId, name: "Медная труба", unit: "m", qty: 5, usedQty: null });
    expect(JSON.stringify(card)).not.toContain("90000");
    expect((await t.call("GET", `/requests/${s.id}/estimates`, s.master)).status).toBe(403);
  });

  it("правило 2: контакты клиента — только после «Принять» и не дольше 30 дней после закрытия", async () => {
    const s = await scene(t);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    const before = (await t.call("GET", `/requests/${s.id}`, s.master)).body.request;
    expect(before.address).toBeNull();
    expect(before.client).toBeNull();
    expect(before.district).toBe("Хамовники");
    await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "accepted" });
    const after = (await t.call("GET", `/requests/${s.id}`, s.master)).body.request;
    expect(after.address).toContain("Ленина");
    expect(after.apartment).toBe("5");
    expect(after.client.phone).toBe("+79990000003");

    await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "en_route" });
    await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "on_site" });
    await t.upload(`/requests/${s.id}/files?kind=before`, s.master);
    await t.upload(`/requests/${s.id}/files?kind=after`, s.master);
    await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "done" });
    await t.call("POST", `/requests/${s.id}/act`, s.client, { accepted: true });
    await invoice(t, s, "works");
    await t.call("POST", `/requests/${s.id}/status`, s.owner, { to: "closed" });
    expect((await t.call("GET", `/requests/${s.id}`, s.master)).body.request.client).not.toBeNull();
    await t.db.query(`UPDATE requests SET closed_at = now() - interval '31 days' WHERE id = $1`, [s.id]);
    const old = (await t.call("GET", `/requests/${s.id}`, s.master)).body.request;
    expect(old.client).toBeNull();
    expect(old.address).toBeNull();
  });

  it("чужой мастер не видит и не двигает заявку", async () => {
    const s = await scene(t);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    await t.call("POST", "/admin/masters", s.owner, { phone: OTHER, name: "Другой", skills: ["climate"], taxStatus: "ip" });
    const other = await t.login(OTHER);
    expect((await t.call("GET", `/requests/${s.id}`, other)).status).toBe(404);
    expect((await t.call("POST", `/requests/${s.id}/status`, other, { to: "accepted" })).status).toBe(404);
    expect((await t.call("GET", "/requests", other)).body.requests).toEqual([]);
  });

  it("мастер не может закрыть заявку и отметить оплату", async () => {
    const s = await scene(t);
    await doWork(t, s);
    expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "act_signed" })).status).toBe(409);
    expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "closed" })).status).toBe(409);
    const inv = await t.call("POST", `/requests/${s.id}/invoices`, s.master, { kind: "works", paymentUrl: "https://pay.example/x" });
    expect(inv.status).toBe(403);
  });

  it("мастер не назначается на чужое направление", async () => {
    const s = await scene(t);
    await t.call("POST", "/admin/masters", s.owner, { phone: OTHER, name: "Электрик", skills: ["electric"], taxStatus: "npd" });
    const list = (await t.call("GET", "/admin/masters", s.owner)).body.masters;
    const electric = list.find((m: { name: string }) => m.name === "Электрик");
    expect((await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: electric.id })).body.error.code).toBe("no_skill");
  });
});
