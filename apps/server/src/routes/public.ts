import type { FastifyInstance } from "fastify";
import type { Services } from "../app";
import { body, param, query } from "../http";
import { schemas } from "../schemas";
import { ApiError } from "../util";

/** Без входа: прайс, заявка с сайта, файлы по подписанной ссылке (docs/TZ.md, 8.2). */
export function publicRoutes(app: FastifyInstance, s: Services) {
  app.get("/services", async () => ({ services: await s.catalog.publicList() }));

  // Лимит заявок по адресу — в памяти процесса: для одного сервера этого достаточно
  const leadHits = new Map<string, number[]>();
  app.post("/public/leads", async (req, reply) => {
    const b = body(schemas.lead, req);
    if (b.website) return reply.status(201).send({ number: null }); // бот: делаем вид, что всё прошло
    const now = Date.now();
    const hits = (leadHits.get(req.ip) ?? []).filter((t) => now - t < 3_600_000);
    if (hits.length >= 5) throw new ApiError(429, "too_many", "Слишком много заявок. Попробуйте позже или позвоните нам");
    leadHits.set(req.ip, [...hits, now]);
    return reply.status(201).send(await s.requests.createLead(b));
  });

  app.get("/files/:id", async (req, reply) => {
    const id = param(req, "id");
    const { exp, sig } = query(schemas.fileGet, req);
    if (!s.files.verify(id, exp, sig)) throw new ApiError(403, "link_expired", "Ссылка на фото устарела. Обновите страницу");
    const f = await s.files.read(s.db, id);
    if (!f) throw new ApiError(404, "not_found", "Фото не найдено");
    return reply.type(f.mime).header("cache-control", "private, max-age=3600").send(f.data);
  });
}
