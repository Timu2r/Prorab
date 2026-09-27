import type { FastifyInstance } from "fastify";
import type { Services } from "../app";
import { body, image, need, param, query } from "../http";
import { schemas } from "../schemas";

/** Сметы, счета и выплаты (docs/TZ.md, 8.4–8.6). */
export function moneyRoutes(app: FastifyInstance, s: Services) {
  const id = (req: Parameters<typeof param>[0]) => param(req, "id");

  // Сметы
  app.get("/requests/:id/estimates", async (req) => ({ estimates: await s.estimates.list(need(req), id(req)) }));
  app.post("/requests/:id/estimates", async (req, reply) => reply.status(201).send({ estimate: await s.estimates.createVersion(need(req), id(req)) }));
  app.put("/estimates/:id/items", async (req) => ({ estimate: await s.estimates.saveDraft(need(req), id(req), body(schemas.estimateDraft, req)) }));
  app.post("/estimates/:id/send", async (req) => ({ estimate: await s.estimates.send(need(req), id(req)) }));
  app.post("/estimates/:id/approve", async (req) => {
    const b = body(schemas.approveEstimate, req);
    return { estimate: await s.estimates.approve(need(req), id(req), { acceptContract: b.acceptContract, ip: req.ip, method: b.method }) };
  });
  app.post("/estimates/:id/reject", async (req) => ({ estimate: await s.estimates.reject(need(req), id(req), body(schemas.reject, req).reason) }));

  // Счета
  app.post("/requests/:id/invoices", async (req, reply) =>
    reply.status(201).send({ invoice: await s.invoices.create(need(req), id(req), body(schemas.newInvoice, req)) }),
  );
  app.patch("/invoices/:id", async (req) => ({ invoice: await s.invoices.update(need(req), id(req), body(schemas.patchInvoice, req)) }));
  app.post("/invoices/:id/send", async (req) => ({ invoice: await s.invoices.send(need(req), id(req)) }));
  app.post("/invoices/:id/paid", async (req) => ({ invoice: await s.invoices.markPaid(need(req), id(req), body(schemas.paid, req).bankRef) }));
  app.post("/invoices/:id/cancel", async (req) => ({ invoice: await s.invoices.cancel(need(req), id(req)) }));

  // Выплаты мастерам
  app.get("/payouts", async (req) => {
    const u = need(req);
    const f = query(schemas.listPayouts, req);
    return s.payouts.list(u, f);
  });
  app.post("/payouts", async (req, reply) => reply.status(201).send({ payout: await s.payouts.createManual(need(req, "owner"), body(schemas.newPayout, req)) }));
  app.patch("/payouts/:id", async (req) => ({ payout: await s.payouts.setAmount(need(req, "owner"), id(req), body(schemas.payoutAmount, req).amount) }));
  app.post("/payouts/:id/paid", async (req) => ({ payout: await s.payouts.markPaid(need(req, "owner"), id(req), body(schemas.payoutPaid, req).method) }));
  app.post("/payouts/:id/cancel", async (req) => ({ payout: await s.payouts.cancel(need(req, "owner"), id(req)) }));
  // Чек самозанятого: JSON со ссылкой из «Мой налог» или фото чека
  app.post("/payouts/:id/receipt", async (req) => {
    const u = need(req, "master");
    const input = Buffer.isBuffer(req.body) ? { image: image(req) } : { url: body(schemas.receipt, req).url };
    return { payout: await s.payouts.addReceipt(u, id(req), input) };
  });
}
