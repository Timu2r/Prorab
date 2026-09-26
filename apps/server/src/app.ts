import cors from "@fastify/cors";
import { CATEGORIES, REQUEST_STATUSES, UNITS, type Role } from "@ks/core";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";
import { CatalogService, MasterService } from "./admin";
import { AuthService, type AuthConfig, type CodeSender, type User } from "./auth";
import type { Db } from "./db";
import { RequestService } from "./requests";
import { ApiError } from "./util";

export type AppConfig = AuthConfig & { webOrigins: string[]; trustProxy: boolean };

declare module "fastify" {
  interface FastifyRequest {
    user: (User & { sessionId: string }) | null;
  }
}

const kopecks = z.number().int().min(0).max(100_000_000_00);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const skills = z.array(z.enum(CATEGORIES)).max(CATEGORIES.length);

const schemas = {
  code: z.object({ phone: z.string().max(30) }),
  verify: z.object({ phone: z.string().max(30), code: z.string().max(10), device: z.string().max(100).default("") }),
  me: z.object({ name: z.string().trim().min(1).max(80) }),
  newService: z.object({ category: z.enum(CATEGORIES), name: z.string().trim().min(2).max(200), unit: z.enum(UNITS), price: kopecks.nullable().default(null) }),
  patchService: z.object({ name: z.string().trim().min(2).max(200), price: kopecks.nullable(), active: z.boolean(), sort: z.number().int() }).partial(),
  master: z.object({
    phone: z.string().max(30),
    name: z.string().trim().min(2).max(80),
    skills: skills.min(1, "Укажите хотя бы одно направление"),
    taxStatus: z.enum(["npd", "ip"]),
    inn: z.string().regex(/^(\d{10}|\d{12})?$/, "ИНН — 10 или 12 цифр").default(""),
    contractNo: z.string().max(40).default(""),
    contractAt: date.nullable().default(null),
    note: z.string().max(500).default(""),
  }),
  patchMaster: z
    .object({
      name: z.string().trim().min(2).max(80),
      skills,
      taxStatus: z.enum(["npd", "ip"]),
      inn: z.string().regex(/^(\d{10}|\d{12})?$/, "ИНН — 10 или 12 цифр"),
      contractNo: z.string().max(40),
      contractAt: date.nullable(),
      note: z.string().max(500),
      active: z.boolean(),
    })
    .partial(),
  rate: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("percent"), percent: z.number().min(1).max(100), validFrom: date }),
    z.object({ mode: z.literal("fixed"), prices: z.record(z.string(), kopecks), validFrom: date }),
  ]),
  newRequest: z.object({
    category: z.enum(CATEGORIES),
    serviceIds: z.array(z.string().max(40)).max(20).default([]),
    description: z.string().max(2000).default(""),
    address: z.string().trim().min(5, "Укажите адрес").max(300),
    district: z.string().max(100).default(""),
    wantedDate: date.nullable().default(null),
    wantedSlot: z.enum(["", "morning", "day", "evening"]).default(""),
    source: z.enum(["site", "app", "call"]).default("app"),
    clientPhone: z.string().max(30).optional(),
    clientName: z.string().max(80).optional(),
  }),
  patchRequest: z
    .object({
      priceWork: kopecks.nullable(),
      priceGoods: kopecks.nullable(),
      description: z.string().max(2000),
      address: z.string().trim().min(5).max(300),
      district: z.string().max(100),
      wantedDate: date.nullable(),
      wantedSlot: z.enum(["", "morning", "day", "evening"]),
      serviceIds: z.array(z.string().max(40)).max(20),
    })
    .partial(),
  status: z.object({ to: z.enum(REQUEST_STATUSES), reason: z.string().max(500).default("") }),
  assign: z.object({ masterId: z.string().max(60) }),
  unassign: z.object({ reason: z.string().max(500).default("") }),
};

export async function buildApp(db: Db, sender: CodeSender, cfg: AppConfig) {
  const app = Fastify({ logger: false, trustProxy: cfg.trustProxy, bodyLimit: 256 * 1024 });
  const auth = new AuthService(db, sender, cfg);
  const requests = new RequestService(db);
  const catalog = new CatalogService(db);
  const masters = new MasterService(db);

  await app.register(cors, {
    // Без Origin приходят запросы из мобильного приложения — их CORS не касается.
    origin: (origin, cb) => cb(null, !origin || cfg.webOrigins.includes(origin)),
    methods: ["GET", "POST", "PATCH", "DELETE"],
  });

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) req.user = await auth.userByToken(h.slice(7));
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.status(400).send({ error: { code: "bad_input", message: first?.message ?? "Неверные данные", field: first?.path.join(".") } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: { code: "bad_request", message: "Неверный запрос" } });
    console.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "Ошибка сервера. Попробуйте ещё раз" } });
  });

  const need = (req: FastifyRequest, role?: Role): User => {
    if (!req.user) throw new ApiError(401, "unauthorized", "Войдите в аккаунт");
    if (role && !req.user.roles.includes(role)) throw new ApiError(403, "forbidden", "Недостаточно прав");
    return req.user;
  };
  const body = <T extends z.ZodType>(s: T, req: FastifyRequest) => s.parse(req.body ?? {}) as z.infer<T>;
  const param = (req: FastifyRequest, k: string) => (req.params as Record<string, string>)[k];

  app.get("/health", async () => ({ ok: true }));

  // Вход
  app.post("/auth/code", async (req) => auth.requestCode(body(schemas.code, req).phone, req.ip));
  app.post("/auth/verify", async (req) => {
    const b = body(schemas.verify, req);
    return auth.verify(b.phone, b.code, b.device);
  });
  app.post("/auth/logout", async (req) => {
    need(req);
    await auth.logout(req.user!.sessionId);
    return { ok: true };
  });
  app.get("/me", async (req) => {
    const u = need(req);
    return { user: { id: u.id, phone: u.phone, name: u.name, roles: u.roles } };
  });
  app.patch("/me", async (req) => {
    const u = need(req);
    const { name } = body(schemas.me, req);
    await db.query(`UPDATE users SET name = $1 WHERE id = $2`, [name, u.id]);
    return { user: { id: u.id, phone: u.phone, name, roles: u.roles } };
  });

  // Прайс: список открыт для сайта без входа, изменения — только владелец
  app.get("/services", async () => ({ services: await catalog.publicList() }));
  app.get("/admin/services", async (req) => (need(req, "owner"), { services: await catalog.adminList() }));
  app.post("/admin/services", async (req) => (need(req, "owner"), { service: await catalog.create(body(schemas.newService, req)) }));
  app.patch("/admin/services/:id", async (req) => (need(req, "owner"), { service: await catalog.update(param(req, "id"), body(schemas.patchService, req)) }));

  // Мастера
  app.get("/admin/masters", async (req) => (need(req, "owner"), { masters: await masters.list() }));
  app.post("/admin/masters", async (req) => (need(req, "owner"), { master: await masters.create(body(schemas.master, req)) }));
  app.get("/admin/masters/:id", async (req) => (need(req, "owner"), { master: await masters.get(param(req, "id")) }));
  app.patch("/admin/masters/:id", async (req) => (need(req, "owner"), { master: await masters.update(param(req, "id"), body(schemas.patchMaster, req)) }));
  app.post("/admin/masters/:id/rates", async (req) => (need(req, "owner"), { master: await masters.setRate(param(req, "id"), body(schemas.rate, req)) }));

  // Заявки: каждая роль видит своё, права проверяются в RequestService
  app.post("/requests", async (req, reply: FastifyReply) => {
    const r = await requests.create(need(req), body(schemas.newRequest, req));
    return reply.status(201).send({ request: r });
  });
  app.get("/requests", async (req) => {
    const status = (req.query as { status?: string }).status;
    return { requests: await requests.list(need(req), status && (REQUEST_STATUSES as readonly string[]).includes(status) ? status : undefined) };
  });
  app.get("/requests/mine", async (req) => ({ requests: await requests.listAsClient(need(req)) }));
  app.get("/requests/:id", async (req) => ({ request: await requests.get(need(req), param(req, "id")) }));
  app.patch("/requests/:id", async (req) => ({ request: await requests.update(need(req), param(req, "id"), body(schemas.patchRequest, req)) }));
  app.post("/requests/:id/status", async (req) => {
    const b = body(schemas.status, req);
    return { request: await requests.setStatus(need(req), param(req, "id"), b.to, b.reason) };
  });
  app.post("/requests/:id/assign", async (req) => ({ request: await requests.assign(need(req), param(req, "id"), body(schemas.assign, req).masterId) }));
  app.post("/requests/:id/unassign", async (req) => ({ result: await requests.unassign(need(req), param(req, "id"), body(schemas.unassign, req).reason) }));

  return app;
}

