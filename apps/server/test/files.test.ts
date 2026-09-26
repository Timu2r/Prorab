import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JPEG, PNG, scene, setup, teardown, type T } from "./helpers";

let t: T;
beforeEach(async () => (t = await setup()));
afterEach(async () => teardown(t));

async function working(s: Awaited<ReturnType<typeof scene>>) {
  await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
  await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "accepted" });
}

describe("фото (правило 14)", () => {
  it("геометки удаляются, фото открывается только по подписанной ссылке", async () => {
    const s = await scene(t);
    await working(s);
    const f = (await t.upload(`/requests/${s.id}/files?kind=before`, s.master)).body.file;
    const res = await t.app.inject({ method: "GET", url: f.url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.rawPayload.includes(Buffer.from("GPS-SECRET"))).toBe(false);
    expect(res.rawPayload.length).toBeLessThan(JPEG.length);
    // Подделанная и просроченная ссылка
    expect((await t.app.inject({ method: "GET", url: f.url.replace(/sig=[^&]+/, "sig=abc") })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: f.url.replace(/exp=\d+/, "exp=1") })).statusCode).toBe(403);
  });

  it("PNG принимается без текстовых метаданных; другие форматы и битые файлы — нет", async () => {
    const s = await scene(t);
    await working(s);
    const png = (await t.upload(`/requests/${s.id}/files?kind=before`, s.master, PNG, "image/png")).body.file;
    const res = await t.app.inject({ method: "GET", url: png.url });
    expect(res.rawPayload.includes(Buffer.from("SECRET-NAME"))).toBe(false);
    expect((await t.upload(`/requests/${s.id}/files?kind=before`, s.master, Buffer.from("GIF89a"), "image/gif")).status).toBe(415);
    expect((await t.upload(`/requests/${s.id}/files?kind=before`, s.master, Buffer.from("not an image"), "image/jpeg")).body.error.code).toBe("bad_image");
  });

  it("кто что загружает: клиент — только свои фото к заявке, мастер — во время работы", async () => {
    const s = await scene(t);
    expect((await t.upload(`/requests/${s.id}/files?kind=client_photo`, s.client)).status).toBe(201);
    expect((await t.upload(`/requests/${s.id}/files?kind=before`, s.client)).status).toBe(403);
    await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId });
    expect((await t.upload(`/requests/${s.id}/files?kind=before`, s.master)).status).toBe(409); // ещё не принял
    expect((await t.upload(`/requests/${s.id}/files?kind=npd_receipt`, s.owner)).status).toBe(400);
  });

  it("своё фото можно удалить, чужое — нет", async () => {
    const s = await scene(t);
    const f = (await t.upload(`/requests/${s.id}/files?kind=client_photo`, s.client)).body.file;
    await working(s);
    expect((await t.call("DELETE", `/files/${f.id}`, s.master)).status).toBe(403);
    expect((await t.call("DELETE", `/files/${f.id}`, s.client)).status).toBe(200);
    expect((await t.app.inject({ method: "GET", url: f.url })).statusCode).toBe(404);
  });
});
