import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scene, setup, teardown, type Scene, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

const HOUR = 3_600_000;
/** Дата по Москве через n дней. */
const mskDay = (n = 0) => new Date(Date.now() + 3 * HOUR + n * 24 * HOUR).toISOString().slice(0, 10);
/** Момент «дата hh:00 по Москве» в ISO. */
const at = (day: string, hour: number) => new Date(Date.parse(`${day}T00:00:00Z`) - 3 * HOUR + hour * HOUR).toISOString();

async function helperMaster(s: Scene, phone = "+79990000320", name = "Бахтиёр Юсупов") {
  const m = await t.call("POST", "/admin/masters", s.owner, { phone, name, skills: ["climate"], taxStatus: "npd" });
  expect(m.status, JSON.stringify(m.body)).toBe(200);
  return { id: m.body.master.id as string, token: await t.login(phone) };
}

/** Заявка с визитом и мастером, принявшим задание. */
async function accepted(s: Scene, visitAt: string, visitUntil: string) {
  await t.call("PATCH", `/requests/${s.id}`, s.owner, { visitAt, visitUntil });
  await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
  expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "accepted" })).status).toBe(200);
}

describe("бригада на заказ (docs/TZ.md, 16.6)", () => {
  it("владелец добавляет помощника; клиент видит, кто за что отвечает; помощник видит задание без суммы и телефона клиента", async () => {
    const s = await scene(t);
    const h = await helperMaster(s);
    const day = mskDay(1);
    await accepted(s, at(day, 9), at(day, 12));

    const set = await t.call("PUT", `/requests/${s.id}/crew`, s.owner, { members: [{ masterId: h.id, role: "Монтаж наружного блока" }] });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.request.crew).toEqual([expect.objectContaining({ masterId: h.id, role: "Монтаж наружного блока", dayFrom: null })]);

    const client = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(client.team).toEqual([
      expect.objectContaining({ name: "Азиз", role: "Старший мастер" }),
      expect.objectContaining({ name: "Бахтиёр Ю.", role: "Монтаж наружного блока", area: "" }),
    ]);

    const [job] = (await t.call("GET", "/requests", h.token)).body.requests;
    expect(job).toMatchObject({ id: s.id, helper: true, pay: null, client: null, address: "Москва, ул. Ленина, 1" });
    const task = (await t.call("GET", `/requests/${s.id}`, h.token)).body.request;
    expect(task).toMatchObject({ role: "helper", pay: null, client: null, lead: { name: "Азиз" } });
    expect(JSON.stringify(task)).not.toContain("1100000"); // цены клиента нет (правило 1)

    // Действует старший: помощник не меняет статус и не загружает фото
    expect((await t.call("POST", `/requests/${s.id}/status`, h.token, { to: "en_route" })).status).toBe(409);
    expect((await t.upload(`/requests/${s.id}/files?kind=before`, h.token)).status).toBe(403);
  });

  it("бригаду задаёт владелец или старший мастер задания; клиент и помощник — нет", async () => {
    const s = await scene(t);
    const h = await helperMaster(s);
    await accepted(s, at(mskDay(1), 9), at(mskDay(1), 12));
    const members = [{ masterId: h.id, role: "Подсобник" }];
    expect((await t.call("PUT", `/requests/${s.id}/crew`, s.master, { members })).status).toBe(200);
    expect((await t.call("PUT", `/requests/${s.id}/crew`, h.token, { members: [] })).status).toBe(403);
    expect((await t.call("PUT", `/requests/${s.id}/crew`, s.client, { members: [] })).status).toBe(403);
    expect((await t.call("PUT", `/requests/${s.id}/crew`, s.owner, { members: [{ masterId: s.masterId, role: "Сам себе" }] })).body.error.code).toBe("is_lead");
    expect((await t.call("PUT", `/requests/${s.id}/crew`, s.owner, { members: [...members, ...members] })).body.error.code).toBe("duplicate");
  });
});

describe("календарь занятости", () => {
  it("визит занимает окна мастера; направление показывает, сколько свободно", async () => {
    const s = await scene(t);
    const day = mskDay(0);
    await accepted(s, at(day, 9), at(day, 12));
    const cal = (await t.call("GET", `/admin/calendar?from=${day}&days=3`, s.owner)).body.calendar;
    expect(cal.days).toEqual([mskDay(0), mskDay(1), mskDay(2)]);
    const aziz = cal.masters.find((m: { id: string }) => m.id === s.masterId);
    expect(aziz.days[0]).toEqual([true, false, false, false]);
    expect(aziz.days[1]).toEqual([false, false, false, false]);
    const climate = cal.directions.find((d: { category: string }) => d.category === "climate");
    expect(climate).toMatchObject({ total: 1, free: [1, 1, 1] }); // утро занято, днём ещё свободен

    // Работы на три дня с 9 до 18 занимают мастера целиком — вечернее окно не делает его свободным
    await t.call("PATCH", `/requests/${s.id}`, s.owner, { visitAt: at(day, 9), visitUntil: at(mskDay(2), 18) });
    const busy = (await t.call("GET", `/admin/calendar?from=${day}&days=4`, s.owner)).body.calendar;
    expect(busy.directions.find((d: { category: string }) => d.category === "climate").free).toEqual([0, 0, 0, 1]);
    expect((await t.call("GET", `/admin/calendar?from=${day}&days=3`, s.master)).status).toBe(403);
  });

  it("помощник со своими днями занят только в эти дни", async () => {
    const s = await scene(t);
    const h = await helperMaster(s);
    await accepted(s, at(mskDay(0), 9), at(mskDay(2), 18));
    await t.call("PUT", `/requests/${s.id}/crew`, s.owner, { members: [{ masterId: h.id, role: "Электрика", dayFrom: mskDay(1), dayTo: mskDay(1) }] });
    const cal = (await t.call("GET", `/admin/calendar?from=${mskDay(0)}&days=3`, s.owner)).body.calendar;
    const helper = cal.masters.find((m: { id: string }) => m.id === h.id);
    expect(helper.days.map((d: boolean[]) => d.some(Boolean))).toEqual([false, true, false]);
    const client = (await t.call("GET", `/requests/${s.id}`, s.client)).body.request;
    expect(client.team[1]).toMatchObject({ role: "Электрика", area: `${Number(mskDay(1).slice(8, 10))}.${mskDay(1).slice(5, 7)}` });
  });

  it("план дня: визит с бригадой и ценой, выезд прораба, заявки без времени", async () => {
    const s = await scene(t);
    const h = await helperMaster(s);
    const day = mskDay(1);
    await accepted(s, at(day, 12), at(day, 15));
    await t.call("PUT", `/requests/${s.id}/crew`, s.owner, { members: [{ masterId: h.id, role: "Монтаж" }] });

    const client2 = await t.login("+79990000330");
    const other = (await t.call("POST", "/requests", client2, { category: "floors", address: "Москва, Арбат, 3" })).body.request.id;
    await t.call("PATCH", `/requests/${other}`, s.owner, { surveyAt: at(day, 9), surveyUntil: at(day, 12) });

    const plan = (await t.call("GET", `/admin/day?date=${day}`, s.owner)).body.day;
    expect(plan.items.map((i: { kind: string; id: string }) => [i.kind, i.id])).toEqual([
      ["survey", other],
      ["visit", s.id],
    ]);
    expect(plan.items[1]).toMatchObject({
      price: 1_100_000,
      crew: [
        { name: "Азиз", role: "Старший" },
        { name: "Бахтиёр Юсупов", role: "Монтаж" },
      ],
    });

    // Согласована, но без времени визита — в «не распределено»
    const s2 = await t.call("POST", "/requests", client2, { category: "climate", address: "Москва, Арбат, 5" });
    const e = (await t.call("POST", `/requests/${s2.body.request.id}/estimates`, s.owner)).body.estimate;
    await t.call("PUT", `/estimates/${e.id}/items`, s.owner, { items: [{ kind: "work", serviceId: null, name: "Монтаж", unit: "pcs", qty: 1, price: 900_000 }] });
    await t.call("POST", `/estimates/${e.id}/approve`, s.owner, {});
    const again = (await t.call("GET", `/admin/day?date=${day}`, s.owner)).body.day;
    expect(again.unscheduled).toContainEqual(expect.objectContaining({ id: s2.body.request.id, price: 900_000 }));
  });
});
