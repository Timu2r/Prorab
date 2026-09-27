import type { FastifyInstance } from "fastify";
import type { Services } from "../app";
import { body, image, need, param, query, session } from "../http";
import { schemas } from "../schemas";

/** Заявки: создание, списки, карточка, статусы, мастер, приёмка, фото (docs/TZ.md, 8.3). Права — в RequestService. */
export function requestRoutes(app: FastifyInstance, s: Services) {
  const id = (req: Parameters<typeof param>[0]) => param(req, "id");

  app.post("/requests", async (req, reply) => reply.status(201).send({ request: await s.requests.create(need(req), body(schemas.newRequest, req)) }));
  // Список и карточка открываются и ключом браузера без кода — только заявки, отправленные с него (docs/TZ.md, 16.4)
  app.get("/requests", async (req) => ({ requests: await s.requests.list(session(req), query(schemas.listRequests, req)) }));
  app.get("/requests/mine", async (req) => ({ requests: await s.requests.listAsClient(need(req)) }));
  app.get("/requests/:id", async (req) => ({ request: await s.requests.get(session(req), id(req)) }));
  app.patch("/requests/:id", async (req) => ({ request: await s.requests.update(need(req), id(req), body(schemas.patchRequest, req)) }));

  app.post("/requests/:id/status", async (req) => {
    const b = body(schemas.status, req);
    return { request: await s.requests.setStatus(need(req), id(req), b.to, b.reason) };
  });
  app.post("/requests/:id/assign", async (req) => ({ request: await s.requests.assign(need(req), id(req), body(schemas.assign, req).masterId) }));
  app.post("/requests/:id/unassign", async (req) => ({ result: await s.requests.unassign(need(req), id(req), body(schemas.unassign, req).reason) }));

  app.post("/requests/:id/extra-work", async (req) => {
    const b = body(schemas.extraWork, req);
    return { request: await s.requests.reportExtraWork(need(req), id(req), b.text, b.fileIds) };
  });
  app.patch("/requests/:id/materials", async (req) => ({ request: await s.requests.reportMaterials(need(req), id(req), body(schemas.materials, req).items) }));

  app.post("/requests/:id/act", async (req) => {
    const b = body(schemas.act, req);
    return { request: await s.requests.act(need(req), id(req), b.accepted, b.remarks) };
  });
  app.post("/requests/:id/act-paper", async (req) => ({ request: await s.requests.actPaper(need(req), id(req), body(schemas.actPaper, req).fileId) }));
  app.post("/requests/:id/review", async (req) => {
    const b = body(schemas.review, req);
    return { request: await s.requests.review(need(req), id(req), b.rating, b.text) };
  });

  app.put("/requests/:id/crew", async (req) => ({ request: await s.requests.setCrew(need(req), id(req), body(schemas.crew, req).members) }));

  // Покупки мастера по ходу работ и решение прораба (docs/TZ.md, 16.9)
  app.post("/requests/:id/purchases", async (req, reply) =>
    reply.status(201).send({ purchases: await s.purchases.add(need(req), id(req), body(schemas.newPurchase, req)) }),
  );
  app.post("/purchases/:id/resolve", async (req) => ({ purchases: await s.purchases.resolve(need(req), id(req), body(schemas.resolvePurchase, req)) }));

  // Фото: тело запроса — сама картинка, вид — в адресе (?kind=before)
  app.post("/requests/:id/files", async (req, reply) =>
    reply.status(201).send({ file: await s.requests.upload(need(req), id(req), query(schemas.fileKind, req).kind, image(req)) }),
  );
  app.delete("/files/:id", async (req) => s.requests.deleteFile(need(req), id(req)));
}
