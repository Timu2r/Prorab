import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LEAD, OTHER, scene, setup, teardown, TEAM, type Scene, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

/** Отец — бригадир, у него мастер в команде; есть ещё мастер со стороны (из сцены). */
async function brigade(s: Scene) {
  const lead = (await t.call("POST", "/admin/masters", s.owner, { phone: LEAD, name: "Отец", skills: ["climate", "vent"], taxStatus: "none", isLead: true })).body
    .master;
  const member = (await t.call("POST", "/admin/masters", s.owner, { phone: TEAM, name: "Рустам", skills: ["climate"], taxStatus: "npd", leadId: lead.id })).body
    .master;
  return { leadId: lead.id as string, memberId: member.id as string, lead: await t.login(LEAD), member: await t.login(TEAM) };
}

describe("бригадир (правило 3)", () => {
  it("владелец назначает бригадиру, тот передаёт своему мастеру и видит задание без цен", async () => {
    const s = await scene(t);
    const b = await brigade(s);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: b.leadId });
    let [job] = (await t.call("GET", "/requests", b.lead)).body.requests;
    expect(job.mine).toBe(true);

    const passed = await t.call("POST", `/requests/${s.id}/assign`, b.lead, { masterId: b.memberId });
    expect(passed.status, JSON.stringify(passed.body)).toBe(200);
    [job] = (await t.call("GET", "/requests", b.member)).body.requests;
    expect(job.status).toBe("assigned");

    const seen = (await t.call("GET", `/requests/${s.id}`, b.lead)).body.request;
    expect(seen.mine).toBe(false);
    expect(seen.role).toBe("lead");
    expect(seen.assignedTo.name).toBe("Рустам");
    expect(seen.priceWork).toBeUndefined();
    expect((await t.call("GET", `/requests/${s.id}/estimates`, b.lead)).status).toBe(403);
  });

  it("бригадир не передаёт задание мастеру не из своей команды и не меняет статусы за мастера", async () => {
    const s = await scene(t);
    const b = await brigade(s);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: b.memberId });
    expect((await t.call("POST", `/requests/${s.id}/assign`, b.lead, { masterId: s.masterId })).body.error.code).toBe("not_team");
    expect((await t.call("POST", `/requests/${s.id}/status`, b.lead, { to: "accepted" })).status).toBe(409);
  });

  it("мастер из команды отказался — задание возвращается бригадиру", async () => {
    const s = await scene(t);
    const b = await brigade(s);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: b.memberId });
    await t.call("POST", `/requests/${s.id}/unassign`, b.member, { reason: "заболел" });
    const r = (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request;
    expect(r.status).toBe("assigned");
    expect(r.master.id).toBe(b.leadId);
  });

  it("мастер со стороны не видит задания бригады; «Команда» — только для бригадира", async () => {
    const s = await scene(t);
    const b = await brigade(s);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: b.memberId });
    expect((await t.call("GET", `/requests/${s.id}`, s.master)).status).toBe(404);
    const team = (await t.call("GET", "/team", b.lead)).body.team;
    expect(team.map((m: { name: string }) => m.name).sort()).toEqual(["Отец", "Рустам"]);
    expect(team.find((m: { name: string }) => m.name === "Рустам").activeJobs).toBe(1);
    expect((await t.call("GET", "/team", s.master)).status).toBe(403);
  });

  it("бригадиром можно сделать только отмеченного бригадира; снять отметку при живой команде нельзя", async () => {
    const s = await scene(t);
    const b = await brigade(s);
    const bad = await t.call("POST", "/admin/masters", s.owner, { phone: OTHER, name: "Новый", skills: ["climate"], taxStatus: "ip", leadId: s.masterId });
    expect(bad.body.error.code).toBe("bad_lead");
    expect((await t.call("PATCH", `/admin/masters/${b.leadId}`, s.owner, { isLead: false })).body.error.code).toBe("has_team");
    const list = (await t.call("GET", "/admin/masters", s.owner)).body.masters;
    const father = list.find((m: { name: string }) => m.name === "Отец");
    expect(father).toMatchObject({ isLead: true, teamSize: 1, taxStatus: "none" });
    expect(list.find((m: { name: string }) => m.name === "Рустам").lead.name).toBe("Отец");
  });
});
