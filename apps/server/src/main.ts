import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { normalizePhone } from "@ks/core";
import { buildApp } from "./app";
import { logSender } from "./auth";
import { openDb } from "./db";
import { migrate } from "./migrations";

const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));

const env = process.env;
const production = env.NODE_ENV === "production";
const codeSecret = env.CODE_SECRET ?? (production ? "" : "dev-secret");
if (!codeSecret) throw new Error("CODE_SECRET обязателен на боевом сервере");
if (production && env.DEV_CODES === "1") throw new Error("DEV_CODES=1 нельзя включать на боевом сервере");

const dataDir = resolve(root, "data", "pg");
if (!env.DATABASE_URL) mkdirSync(dataDir, { recursive: true });
const db = await openDb({ url: env.DATABASE_URL || undefined, dataDir });
await migrate(db);

const app = await buildApp(db, logSender, {
  ownerPhones: (env.OWNER_PHONES ?? "").split(",").map((p) => normalizePhone(p)).filter((p): p is string => !!p),
  devCodes: env.DEV_CODES === "1",
  codeSecret,
  webOrigins: (env.WEB_ORIGINS ?? "http://localhost:5190").split(",").map((s) => s.trim()),
  trustProxy: env.TRUST_PROXY === "1",
});

const port = Number(env.PORT ?? 4100);
await app.listen({ port, host: "0.0.0.0" });
console.log(`Сервер: http://localhost:${port} (база: ${env.DATABASE_URL ? "PostgreSQL" : "встроенная, data/pg"})`);
