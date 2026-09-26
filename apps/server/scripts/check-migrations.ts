// Прогоняет все миграции на чистой базе в памяти и печатает список таблиц. Запуск: npx tsx scripts/check-migrations.ts
import { openDb } from "../src/db";
import { migrate } from "../src/migrations";

const db = await openDb({});
await migrate(db);
const tables = await db.query<{ table_name: string }>(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
);
console.log(tables.map((r) => r.table_name).join(", "));
await db.close();
