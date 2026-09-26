import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { CatalogService, MasterService } from "./admin";
import { AuthService, type AuthConfig, type CodeSender } from "./auth";
import { ClientService } from "./clients";
import { DashboardService } from "./dashboard";
import type { Db } from "./db";
import { EstimateService } from "./estimates";
import { FileService, IMAGE_TYPES, MAX_FILE_BYTES } from "./files";
import "./http";
import { InvoiceService } from "./invoices";
import { PayoutService } from "./payouts";
import { RequestService } from "./requests";
import { adminRoutes } from "./routes/admin";
import { authRoutes } from "./routes/auth";
import { moneyRoutes } from "./routes/money";
import { publicRoutes } from "./routes/public";
import { requestRoutes } from "./routes/requests";
import { SettingsService } from "./settings";
import { ApiError } from "./util";

export type AppConfig = AuthConfig & {
  webOrigins: string[];
  trustProxy: boolean;
  uploadsDir: string;
  fileSecret: string;
};

export type Services = {
  db: Db;
  auth: AuthService;
  requests: RequestService;
  estimates: EstimateService;
  invoices: InvoiceService;
  payouts: PayoutService;
  files: FileService;
  catalog: CatalogService;
  masters: MasterService;
  clients: ClientService;
  dashboard: DashboardService;
  settings: SettingsService;
};

export async function buildApp(db: Db, sender: CodeSender, cfg: AppConfig) {
  const app = Fastify({ logger: false, trustProxy: cfg.trustProxy, bodyLimit: 256 * 1024 });

  const files = new FileService(cfg.uploadsDir, cfg.fileSecret);
  const settings = new SettingsService(db, cfg.ownerPhones);
  const payouts = new PayoutService(db, files);
  const s: Services = {
    db,
    auth: new AuthService(db, sender, cfg),
    requests: new RequestService(db, files, payouts, settings),
    estimates: new EstimateService(db),
    invoices: new InvoiceService(db),
    payouts,
    files,
    catalog: new CatalogService(db),
    masters: new MasterService(db),
    clients: new ClientService(db),
    dashboard: new DashboardService(db, settings),
    settings,
  };

  await app.register(cors, {
    // Без Origin приходят запросы из мобильного приложения — их CORS не касается.
    origin: (origin, cb) => cb(null, !origin || cfg.webOrigins.includes(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Фото приходят как есть (image/jpeg, image/png), без multipart
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: "buffer", bodyLimit: MAX_FILE_BYTES }, (_req, data, done) => done(null, data));

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) req.user = await s.auth.userByToken(h.slice(7));
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.status(400).send({ error: { code: "bad_input", message: first?.message ?? "Неверные данные", field: first?.path.join(".") } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 413) return reply.status(413).send({ error: { code: "too_big", message: "Файл слишком большой" } });
    if (status === 415) return reply.status(415).send({ error: { code: "bad_type", message: "Неподдерживаемый формат" } });
    if (status && status < 500) return reply.status(status).send({ error: { code: "bad_request", message: "Неверный запрос" } });
    console.error(err);
    return reply.status(500).send({ error: { code: "internal", message: "Ошибка сервера. Попробуйте ещё раз" } });
  });

  authRoutes(app, s);
  publicRoutes(app, s);
  requestRoutes(app, s);
  moneyRoutes(app, s);
  adminRoutes(app, s);
  return app;
}
