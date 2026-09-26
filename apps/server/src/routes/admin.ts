import type { FastifyInstance } from "fastify";
import type { Services } from "../app";
import { body, need, param, query } from "../http";
import { schemas } from "../schemas";

/** Раздел владельца и команда бригадира (docs/TZ.md, 8.6–8.7). */
export function adminRoutes(app: FastifyInstance, s: Services) {
  const id = (req: Parameters<typeof param>[0]) => param(req, "id");

  // Прайс
  app.get("/admin/services", async (req) => (need(req, "owner"), { services: await s.catalog.adminList() }));
  app.post("/admin/services", async (req) => (need(req, "owner"), { service: await s.catalog.create(body(schemas.newService, req)) }));
  app.patch("/admin/services/:id", async (req) => (need(req, "owner"), { service: await s.catalog.update(id(req), body(schemas.patchService, req)) }));
  app.post("/admin/services/reprice", async (req) => {
    need(req, "owner");
    const b = body(schemas.reprice, req);
    return { services: await s.catalog.reprice(b.percent, b.category) };
  });

  // Мастера
  app.get("/admin/masters", async (req) => (need(req, "owner"), { masters: await s.masters.list() }));
  app.post("/admin/masters", async (req) => (need(req, "owner"), { master: await s.masters.create(body(schemas.master, req)) }));
  app.get("/admin/masters/:id", async (req) => (need(req, "owner"), { master: await s.masters.get(id(req)) }));
  app.patch("/admin/masters/:id", async (req) => (need(req, "owner"), { master: await s.masters.update(id(req), body(schemas.patchMaster, req)) }));
  app.post("/admin/masters/:id/rates", async (req) => (need(req, "owner"), { master: await s.masters.setRate(id(req), body(schemas.rate, req)) }));
  app.get("/team", async (req) => ({ team: await s.masters.team(need(req, "master").id) }));
  app.put("/me/availability", async (req) => s.masters.setAvailable(need(req, "master").id, body(schemas.availability, req).available));

  // Клиенты
  app.get("/admin/clients", async (req) => (need(req, "owner"), { clients: await s.clients.list(query(schemas.listClients, req).q) }));
  app.get("/admin/clients/:id", async (req) => (need(req, "owner"), { client: await s.clients.get(id(req)) }));
  app.patch("/admin/clients/:id", async (req) => (need(req, "owner"), { client: await s.clients.patch(id(req), body(schemas.patchClient, req)) }));

  // Сводка, отчёты, настройки
  app.get("/admin/dashboard", async (req) => (need(req, "owner"), { dashboard: await s.dashboard.dashboard() }));
  app.get("/admin/reports/money", async (req) => (need(req, "owner"), { report: await s.dashboard.money(query(schemas.month, req).month) }));
  app.get("/admin/reports/funnel", async (req) => {
    need(req, "owner");
    const p = query(schemas.period, req);
    return { report: await s.dashboard.funnel(p.from, p.to) };
  });
  app.get("/admin/settings", async (req) => (need(req, "owner"), { settings: await s.settings.get() }));
  app.patch("/admin/settings", async (req) => ({ settings: await s.settings.patch(need(req, "owner").id, body(schemas.settings, req)) }));
  app.get("/admin/notifications", async (req) => {
    need(req, "owner");
    const rows = await s.db.query(
      `SELECT id, phone, channel, template, body, status, error, request_id AS "requestId", created_at AS "createdAt", sent_at AS "sentAt"
       FROM notifications ORDER BY created_at DESC LIMIT 200`,
    );
    return { notifications: rows };
  });
}
