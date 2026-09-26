import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

/**
 * Общий вид базы для кода сервера. В разработке и тестах — PGlite (PostgreSQL внутри процесса,
 * без Docker), на боевом сервере — настоящий PostgreSQL через DATABASE_URL. SQL один и тот же.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Выполняет несколько команд без параметров (миграции). */
  exec(sql: string): Promise<void>;
  /** Всё внутри fn выполняется одной транзакцией: либо всё, либо ничего. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDb(opts: { url?: string; dataDir?: string }): Promise<Db> {
  if (opts.url) return pgDb(new pg.Pool({ connectionString: opts.url }));
  const lite = new PGlite(opts.dataDir); // без dataDir база живёт только в памяти (тесты)
  await lite.waitReady;
  return liteDb(lite);
}

function liteDb(lite: PGlite): Db {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await lite.query<T>(sql, params as never[])).rows;
    },
    async exec(sql) {
      await lite.exec(sql);
    },
    tx(fn) {
      return lite.transaction((t) =>
        fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await t.query<T>(sql, params as never[])).rows;
          },
        }),
      );
    },
    close: () => lite.close(),
  };
}

function pgDb(pool: pg.Pool): Db {
  return {
    async query<T>(sql: string, params?: unknown[]) {
      return (await pool.query(sql, params)).rows as T[];
    },
    async exec(sql) {
      await pool.query(sql);
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          async query<T>(sql: string, params?: unknown[]) {
            return (await client.query(sql, params)).rows as T[];
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
