import { DEFAULT_SERVICES, MARKET_PRICES_RUB, startPriceRub } from "@ks/core";
import type { Db } from "./db";

/**
 * Миграции применяются по порядку и ровно один раз. После первого выпуска на боевой сервер миграции не меняем —
 * только добавляем новые (до выпуска, пока база есть лишь у разработчика, 1 и 2 правятся с пересозданием базы).
 * Деньги в копейках (bigint), удаление мягкое (deleted_at), история заявки не стирается.
 */
const MIGRATIONS: { id: number; sql: () => string }[] = [
  {
    id: 1,
    sql: () => `
      CREATE TABLE users (
        id          text PRIMARY KEY,
        phone       text NOT NULL UNIQUE,
        name        text NOT NULL DEFAULT '',
        roles       text[] NOT NULL DEFAULT '{client}',
        created_at  timestamptz NOT NULL DEFAULT now(),
        deleted_at  timestamptz
      );

      CREATE TABLE login_codes (
        id          text PRIMARY KEY,
        phone       text NOT NULL,
        code_hash   text NOT NULL,
        attempts    int NOT NULL DEFAULT 0,
        ip          text NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz
      );
      CREATE INDEX login_codes_phone ON login_codes (phone, created_at);
      CREATE INDEX login_codes_ip ON login_codes (ip, created_at);

      CREATE TABLE sessions (
        id          text PRIMARY KEY,
        user_id     text NOT NULL REFERENCES users(id),
        token_hash  text NOT NULL UNIQUE,
        device      text NOT NULL DEFAULT '',
        created_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        revoked_at  timestamptz
      );

      CREATE TABLE masters (
        user_id     text PRIMARY KEY REFERENCES users(id),
        skills      text[] NOT NULL DEFAULT '{}',
        tax_status  text NOT NULL CHECK (tax_status IN ('npd', 'ip')),
        inn         text NOT NULL DEFAULT '',
        contract_no text NOT NULL DEFAULT '',
        contract_at date,
        note        text NOT NULL DEFAULT '',
        active      boolean NOT NULL DEFAULT true,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      -- Ставка мастера с датой начала: старые заявки считаются по старой ставке.
      CREATE TABLE master_rates (
        id          text PRIMARY KEY,
        master_id   text NOT NULL REFERENCES masters(user_id),
        mode        text NOT NULL CHECK (mode IN ('percent', 'fixed')),
        percent     numeric(5,2),
        prices      jsonb NOT NULL DEFAULT '{}',
        valid_from  date NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE services (
        id          text PRIMARY KEY,
        category    text NOT NULL,
        name        text NOT NULL,
        unit        text NOT NULL,
        price       bigint,           -- цена «от» для клиента, копейки; null — ещё не задана
        active      boolean NOT NULL DEFAULT true,
        sort        int NOT NULL DEFAULT 0
      );

      CREATE SEQUENCE request_number_seq;

      CREATE TABLE requests (
        id            text PRIMARY KEY,
        number        int NOT NULL UNIQUE DEFAULT nextval('request_number_seq'),
        client_id     text NOT NULL REFERENCES users(id),
        master_id     text REFERENCES masters(user_id),
        category      text NOT NULL,
        service_ids   text[] NOT NULL DEFAULT '{}',
        description   text NOT NULL DEFAULT '',
        address       text NOT NULL DEFAULT '',
        district      text NOT NULL DEFAULT '',
        wanted_date   date,
        wanted_slot   text NOT NULL DEFAULT '',
        source        text NOT NULL CHECK (source IN ('site', 'app', 'call')),
        status        text NOT NULL DEFAULT 'new',
        price_work    bigint,
        price_goods   bigint,
        prepaid_at    timestamptz,
        cancel_reason text NOT NULL DEFAULT '',
        consent_at    timestamptz,      -- согласие клиента на обработку персональных данных (152-ФЗ)
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        deleted_at    timestamptz
      );
      CREATE INDEX requests_client ON requests (client_id);
      CREATE INDEX requests_master ON requests (master_id);
      CREATE INDEX requests_status ON requests (status);

      CREATE TABLE request_events (
        id          text PRIMARY KEY,
        request_id  text NOT NULL REFERENCES requests(id),
        at          timestamptz NOT NULL DEFAULT now(),
        actor_id    text REFERENCES users(id),
        actor_role  text NOT NULL,
        kind        text NOT NULL,
        payload     jsonb NOT NULL DEFAULT '{}'
      );
      CREATE INDEX request_events_request ON request_events (request_id, at);
    `,
  },
  {
    id: 2,
    sql: () =>
      DEFAULT_SERVICES.map(
        (s, i) =>
          `INSERT INTO services (id, category, name, unit, sort) VALUES ('svc_${s.key}','${s.category}', '${s.name.replace(/'/g, "''")}', '${s.unit}', ${(i + 1) * 10});`,
      ).join("\n"),
  },
  {
    // Рыночные цены «от» — только там, где владелец ещё не вписал свою цену
    id: 3,
    sql: () =>
      Object.entries(MARKET_PRICES_RUB)
        .map(([key, rub]) => `UPDATE services SET price = ${rub * 100} WHERE id = 'svc_${key}' AND price IS NULL;`)
        .join("\n"),
  },
  {
    // Наценка 10% к рынку — только там, где стоит рыночная цена из миграции 3: свои цены владельца не трогаем
    id: 4,
    sql: () =>
      Object.entries(MARKET_PRICES_RUB)
        .map(([key, rub]) => `UPDATE services SET price = ${startPriceRub(key, 10)! * 100} WHERE id = 'svc_${key}' AND price = ${rub * 100};`)
        .join("\n"),
  },
];

export async function migrate(db: Db): Promise<void> {
  await db.exec(`CREATE TABLE IF NOT EXISTS migrations (id int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query<{ id: number }>(`SELECT id FROM migrations`)).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.tx(async (q) => {
      for (const stmt of splitSql(m.sql())) await q.query(stmt);
      await q.query(`INSERT INTO migrations (id) VALUES ($1)`, [m.id]);
    });
  }
}

/** Делит миграцию на команды по «;» в конце строки (в наших миграциях нет «;» внутри строк). */
function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}
