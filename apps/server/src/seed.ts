import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { CATEGORIES, normalizePhone, type Category } from "@ks/core";
import { MasterService } from "./admin";
import { openDb } from "./db";
import { migrate } from "./migrations";
import { moscowDate } from "./time";

/**
 * Демо-мастера на все направления — чтобы любую заявку было кому назначить и можно было пройти путь заказа
 * целиком. Запуск при остановленном сервере: `pnpm --filter @ks/server seed`. Повторный запуск ничего не дублирует.
 * Номера вымышленные: перед подключением SMS (этап F) демо-мастеров отключить в разделе «Мастера».
 */
type Demo = { phone: string; name: string; skills: Category[]; lead?: boolean; team?: string };

const DEMO: Demo[] = [
  { phone: "+79990000101", name: "Азиз Рахимов", skills: ["climate", "vent"] },
  { phone: "+79990000102", name: "Сергей Волков", skills: ["electric", "general"] },
  { phone: "+79990000103", name: "Дмитрий Орлов", skills: ["plumbing", "general"] },
  { phone: "+79990000104", name: "Алексей Кузнецов", skills: ["turnkey", "finishing", "floors", "general"], lead: true },
  { phone: "+79990000105", name: "Бахтиёр Юсупов", skills: ["finishing", "floors", "turnkey"], team: "+79990000104" },
  { phone: "+79990000106", name: "Руслан Каримов", skills: ["floors", "finishing", "turnkey"], team: "+79990000104" },
  { phone: "+79990000107", name: "Фарход Назаров", skills: ["facade", "finishing"] },
  { phone: "+79990000108", name: "Олег Никитин", skills: [...CATEGORIES] },
];

const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
if (process.env.NODE_ENV === "production" && !process.argv.includes("--force"))
  throw new Error("На боевом сервере демо-мастера не нужны. Если всё же нужно — запустите с --force");

const dataDir = resolve(root, "data", "pg");
if (!process.env.DATABASE_URL) mkdirSync(dataDir, { recursive: true });
const db = await openDb({ url: process.env.DATABASE_URL || undefined, dataDir });
await migrate(db);
const masters = new MasterService(db);

const idByPhone = async (phone: string) =>
  (await db.query<{ id: string }>(`SELECT u.id FROM users u JOIN masters m ON m.user_id = u.id WHERE u.phone = $1`, [normalizePhone(phone)]))[0]?.id;

// Сначала бригадиры, потом их команды
for (const d of [...DEMO.filter((x) => !x.team), ...DEMO.filter((x) => x.team)]) {
  if (await idByPhone(d.phone)) {
    console.log(`  есть: ${d.name}`);
    continue;
  }
  const leadId = d.team ? ((await idByPhone(d.team)) ?? null) : null;
  const m = await masters.create({
    phone: d.phone,
    name: d.name,
    skills: d.skills,
    taxStatus: "npd",
    inn: "",
    contractNo: "",
    contractAt: null,
    npdCheckedAt: null,
    note: "Демо-мастер для проверки сервиса. Отключить перед подключением SMS.",
    isLead: d.lead ?? false,
    leadId,
  });
  await masters.setRate(m.id, { mode: "percent", percent: 50, validFrom: moscowDate() });
  console.log(`  добавлен: ${d.name} — ${d.skills.length} направл.${d.lead ? ", бригадир" : ""}${leadId ? ", в бригаде" : ""}`);
}

await db.close();
console.log("Готово: демо-мастера на все направления, ставка 50% от работ.");
