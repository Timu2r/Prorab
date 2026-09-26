import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { buildApp } from "../src/app";
import type { CodeSender } from "../src/auth";
import { openDb, type Db } from "../src/db";
import { migrate } from "../src/migrations";

export const OWNER = "+79990000001";
export const MASTER = "+79990000002";
export const CLIENT = "+79990000003";
export const OTHER = "+79990000004";
export const LEAD = "+79990000005";
export const TEAM = "+79990000006";

type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type T = {
  db: Db;
  app: FastifyInstance;
  sent: { phone: string; code: string }[];
  dir: string;
  call(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, token?: string, payload?: object): Promise<Res>;
  login(phone: string, ip?: string): Promise<string>;
  upload(url: string, token: string, data?: Buffer, mime?: string): Promise<Res>;
};

/** Чистая база в памяти, папка для фото во временной папке. */
export async function setup(): Promise<T> {
  const db = await openDb({});
  await migrate(db);
  const dir = await mkdtemp(join(tmpdir(), "otves-test-"));
  const sent: { phone: string; code: string }[] = [];
  const sender: CodeSender = { send: async (phone, code) => void sent.push({ phone, code }) };
  const app = await buildApp(db, sender, {
    ownerPhones: [OWNER],
    devCodes: false,
    codeSecret: "test",
    webOrigins: [],
    trustProxy: false,
    uploadsDir: dir,
    fileSecret: "test-files",
  });
  const t: T = {
    db,
    app,
    sent,
    dir,
    async call(method, url, token, payload) {
      const res = await app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
      return { status: res.statusCode, body: res.body ? res.json() : null };
    },
    async login(phone, ip = "1.1.1.1") {
      const res = await app.inject({ method: "POST", url: "/auth/code", payload: { phone }, remoteAddress: ip });
      expect(res.statusCode, res.body).toBe(200);
      const normalized: string = res.json().phone;
      const code = sent.findLast((s) => s.phone === normalized)!.code;
      const v = await t.call("POST", "/auth/verify", undefined, { phone, code });
      expect(v.status).toBe(200);
      return v.body.token;
    },
    async upload(url, token, data = JPEG, mime = "image/jpeg") {
      const res = await app.inject({ method: "POST", url, payload: data, headers: { authorization: `Bearer ${token}`, "content-type": mime } });
      return { status: res.statusCode, body: res.body ? res.json() : null };
    },
  };
  return t;
}

export async function teardown(t: T) {
  await t.app.close();
  await t.db.close();
  await rm(t.dir, { recursive: true, force: true });
}

function segment(marker: number, payload: Buffer) {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** Маленький JPEG по структуре: JFIF, EXIF с «геометкой», начало данных изображения. */
export const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  segment(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
  segment(0xe1, Buffer.from("Exif\0\0GPS-SECRET-55.75,37.61", "latin1")),
  segment(0xda, Buffer.from([0, 1, 1, 0, 0x3f, 0])),
  Buffer.from([1, 2, 3, 4]),
  Buffer.from([0xff, 0xd9]),
]);

/** Маленький PNG по структуре: заголовок, текстовый блок с метаданными, конец. */
export const PNG = (() => {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", Buffer.alloc(13)),
    chunk("tEXt", Buffer.from("Author\0SECRET-NAME", "latin1")),
    chunk("IDAT", Buffer.from([1, 2, 3])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
})();

export type Scene = { owner: string; master: string; client: string; id: string; masterId: string; estimateId: string; materialId: string | null };

/**
 * Типовая заявка: владелец, мастер по кондиционерам со ставкой 50%, клиент.
 * Смета: монтаж 11 000 ₽ (+ медная труба 5 м по 900 ₽, закупка по 700 ₽, если materials), утверждена клиентом.
 */
export async function scene(t: T, opts: { materials?: boolean } = {}): Promise<Scene> {
  const owner = await t.login(OWNER);
  const m = await t.call("POST", "/admin/masters", owner, { phone: MASTER, name: "Азиз", skills: ["climate"], taxStatus: "npd" });
  expect(m.status, JSON.stringify(m.body)).toBe(200);
  const masterId: string = m.body.master.id;
  await t.call("POST", `/admin/masters/${masterId}/rates`, owner, { mode: "percent", percent: 50, validFrom: "2026-01-01" });
  const master = await t.login(MASTER);
  const client = await t.login(CLIENT);
  const r = await t.call("POST", "/requests", client, { category: "climate", address: "Москва, ул. Ленина, 1", apartment: "5", district: "Хамовники" });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const id: string = r.body.request.id;
  const est = await t.call("POST", `/requests/${id}/estimates`, owner);
  const estimateId: string = est.body.estimate.id;
  const items: object[] = [{ kind: "work", serviceId: "svc_climate-mount-small", name: "Монтаж сплит-системы", unit: "pcs", qty: 1, price: 1_100_000 }];
  if (opts.materials) items.push({ kind: "material", serviceId: null, name: "Медная труба", unit: "m", qty: 5, price: 90_000, cost: 70_000 });
  const saved = await t.call("PUT", `/estimates/${estimateId}/items`, owner, { items });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  expect((await t.call("POST", `/estimates/${estimateId}/send`, owner)).status).toBe(200);
  const ok = await t.call("POST", `/estimates/${estimateId}/approve`, client, { acceptContract: true });
  expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  const materialId = opts.materials ? (saved.body.estimate.items.find((i: { kind: string }) => i.kind === "material")?.id ?? null) : null;
  return { owner, master, client, id, masterId, estimateId, materialId };
}

/** Назначить мастера, принять, выехать, на месте, фото до и после, расход материалов, «Готово». */
export async function doWork(t: T, s: Scene) {
  expect((await t.call("POST", `/requests/${s.id}/assign`, s.owner, { masterId: s.masterId })).status).toBe(200);
  for (const to of ["accepted", "en_route", "on_site"]) expect((await t.call("POST", `/requests/${s.id}/status`, s.master, { to })).status).toBe(200);
  expect((await t.upload(`/requests/${s.id}/files?kind=before`, s.master)).status).toBe(201);
  expect((await t.upload(`/requests/${s.id}/files?kind=after`, s.master)).status).toBe(201);
  if (s.materialId) expect((await t.call("PATCH", `/requests/${s.id}/materials`, s.master, { items: [{ itemId: s.materialId, usedQty: 4 }] })).status).toBe(200);
  const done = await t.call("POST", `/requests/${s.id}/status`, s.master, { to: "done" });
  expect(done.status, JSON.stringify(done.body)).toBe(200);
}

/** Счёт владельца: создать, вставить ссылку, отправить, при необходимости отметить оплату. */
export async function invoice(t: T, s: Scene, kind: string, pay = true, amount?: number) {
  const inv = await t.call("POST", `/requests/${s.id}/invoices`, s.owner, { kind, paymentUrl: "https://pay.example/abc", ...(amount ? { amount } : {}) });
  expect(inv.status, JSON.stringify(inv.body)).toBe(201);
  expect((await t.call("POST", `/invoices/${inv.body.invoice.id}/send`, s.owner)).status).toBe(200);
  if (pay) expect((await t.call("POST", `/invoices/${inv.body.invoice.id}/paid`, s.owner)).status).toBe(200);
  return inv.body.invoice.id as string;
}

export async function status(t: T, s: Scene) {
  return (await t.call("GET", `/requests/${s.id}`, s.owner)).body.request.status as string;
}
