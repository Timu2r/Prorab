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
  {
    // Версия 1.0 (docs/TZ.md, раздел 7): сметы, счета, приёмка, фото, выплаты, бригады, клиенты, SMS, настройки
    id: 5,
    sql: () => `
      ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
      ALTER TABLE login_codes ADD COLUMN provider_ref text;
      ALTER TABLE sessions ADD COLUMN last_used_at timestamptz;

      CREATE TABLE client_profiles (
        user_id      text PRIMARY KEY REFERENCES users(id),
        type         text NOT NULL DEFAULT 'person' CHECK (type IN ('person', 'company')),
        company_name text NOT NULL DEFAULT '',
        inn          text NOT NULL DEFAULT '',
        kpp          text NOT NULL DEFAULT '',
        note         text NOT NULL DEFAULT ''
      );

      ALTER TABLE masters DROP CONSTRAINT masters_tax_status_check;
      ALTER TABLE masters ADD CONSTRAINT masters_tax_status_check CHECK (tax_status IN ('npd', 'ip', 'none'));
      ALTER TABLE masters ADD COLUMN lead_id text REFERENCES masters(user_id);
      ALTER TABLE masters ADD COLUMN is_lead boolean NOT NULL DEFAULT false;
      ALTER TABLE masters ADD COLUMN npd_checked_at date;
      CREATE INDEX masters_lead ON masters (lead_id);

      ALTER TABLE requests DROP CONSTRAINT requests_source_check;
      ALTER TABLE requests ADD CONSTRAINT requests_source_check CHECK (source IN ('site', 'app', 'call', 'avito', 'maps', 'recommendation', 'other'));
      ALTER TABLE requests ADD COLUMN apartment text NOT NULL DEFAULT '';
      ALTER TABLE requests ADD COLUMN entrance text NOT NULL DEFAULT '';
      ALTER TABLE requests ADD COLUMN floor text NOT NULL DEFAULT '';
      ALTER TABLE requests ADD COLUMN intercom text NOT NULL DEFAULT '';
      ALTER TABLE requests ADD COLUMN visit_at timestamptz;
      ALTER TABLE requests ADD COLUMN visit_until timestamptz;
      ALTER TABLE requests ADD COLUMN utm jsonb;
      ALTER TABLE requests ADD COLUMN done_at timestamptz;
      ALTER TABLE requests ADD COLUMN act_signed_at timestamptz;
      ALTER TABLE requests ADD COLUMN paid_at timestamptz;
      ALTER TABLE requests ADD COLUMN closed_at timestamptz;
      ALTER TABLE requests ADD COLUMN warranty_until date;
      ALTER TABLE requests ADD COLUMN refund_required boolean NOT NULL DEFAULT false;
      ALTER TABLE requests ADD COLUMN owner_note text NOT NULL DEFAULT '';
      ALTER TABLE requests ADD COLUMN rating smallint CHECK (rating BETWEEN 1 AND 5);
      ALTER TABLE requests ADD COLUMN review text NOT NULL DEFAULT '';
      CREATE INDEX requests_visit ON requests (visit_at);

      CREATE TABLE estimates (
        id              text PRIMARY KEY,
        request_id      text NOT NULL REFERENCES requests(id),
        version         int NOT NULL,
        status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'rejected', 'superseded')),
        reserve_percent numeric(5,2) NOT NULL DEFAULT 0,
        note            text NOT NULL DEFAULT '',
        created_by      text REFERENCES users(id),
        created_at      timestamptz NOT NULL DEFAULT now(),
        sent_at         timestamptz,
        approved_at     timestamptz,
        approved_by     text REFERENCES users(id),
        reject_reason   text NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX estimates_version ON estimates (request_id, version);
      CREATE UNIQUE INDEX estimates_one_approved ON estimates (request_id) WHERE status = 'approved';

      CREATE TABLE estimate_items (
        id          text PRIMARY KEY,
        estimate_id text NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
        kind        text NOT NULL CHECK (kind IN ('work', 'material', 'equipment')),
        service_id  text REFERENCES services(id),
        name        text NOT NULL,
        unit        text NOT NULL,
        qty         numeric(12,3) NOT NULL CHECK (qty > 0),
        price       bigint NOT NULL CHECK (price >= 0),
        cost        bigint CHECK (cost >= 0),
        used_qty    numeric(12,3) CHECK (used_qty >= 0),
        sort        int NOT NULL DEFAULT 0
      );
      CREATE INDEX estimate_items_estimate ON estimate_items (estimate_id, sort);

      CREATE TABLE invoices (
        id           text PRIMARY KEY,
        request_id   text NOT NULL REFERENCES requests(id),
        number       text NOT NULL UNIQUE,
        kind         text NOT NULL CHECK (kind IN ('materials', 'works', 'full', 'other')),
        amount       bigint NOT NULL CHECK (amount > 0),
        payment_url  text NOT NULL DEFAULT '',
        status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled', 'refunded')),
        created_by   text REFERENCES users(id),
        confirmed_by text REFERENCES users(id),
        created_at   timestamptz NOT NULL DEFAULT now(),
        sent_at      timestamptz,
        paid_at      timestamptz,
        bank_ref     text NOT NULL DEFAULT ''
      );
      CREATE INDEX invoices_request ON invoices (request_id);

      CREATE TABLE payouts (
        id           text PRIMARY KEY,
        master_id    text NOT NULL REFERENCES masters(user_id),
        request_id   text REFERENCES requests(id),
        kind         text NOT NULL CHECK (kind IN ('work', 'deduction', 'bonus')),
        amount       bigint NOT NULL,
        needs_amount boolean NOT NULL DEFAULT false,
        reason       text NOT NULL DEFAULT '',
        status       text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued', 'paid', 'cancelled')),
        accrued_at   timestamptz NOT NULL DEFAULT now(),
        paid_at      timestamptz,
        method       text CHECK (method IN ('bank', 'personal')),
        receipt_url  text NOT NULL DEFAULT '',
        created_by   text REFERENCES users(id)
      );
      CREATE INDEX payouts_master ON payouts (master_id, status);
      CREATE INDEX payouts_request ON payouts (request_id);

      CREATE TABLE files (
        id          text PRIMARY KEY,
        request_id  text REFERENCES requests(id),
        payout_id   text REFERENCES payouts(id),
        uploaded_by text NOT NULL REFERENCES users(id),
        kind        text NOT NULL CHECK (kind IN ('client_photo', 'before', 'after', 'extra_work', 'act_paper', 'npd_receipt')),
        storage_key text NOT NULL,
        mime        text NOT NULL,
        size        int NOT NULL,
        width       int,
        height      int,
        created_at  timestamptz NOT NULL DEFAULT now(),
        deleted_at  timestamptz
      );
      CREATE INDEX files_request ON files (request_id);
      CREATE INDEX files_payout ON files (payout_id);

      CREATE TABLE acts (
        id         text PRIMARY KEY,
        request_id text NOT NULL REFERENCES requests(id),
        accepted   boolean NOT NULL,
        remarks    text NOT NULL DEFAULT '',
        method     text NOT NULL CHECK (method IN ('app', 'paper')),
        file_id    text REFERENCES files(id),
        signed_by  text NOT NULL REFERENCES users(id),
        signed_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX acts_request ON acts (request_id);

      CREATE TABLE notifications (
        id           text PRIMARY KEY,
        user_id      text REFERENCES users(id),
        phone        text NOT NULL DEFAULT '',
        channel      text NOT NULL CHECK (channel IN ('sms', 'call', 'push')),
        template     text NOT NULL,
        body         text NOT NULL DEFAULT '',
        status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
        attempts     int NOT NULL DEFAULT 0,
        provider_ref text NOT NULL DEFAULT '',
        error        text NOT NULL DEFAULT '',
        request_id   text REFERENCES requests(id),
        created_at   timestamptz NOT NULL DEFAULT now(),
        sent_at      timestamptz
      );
      CREATE INDEX notifications_status ON notifications (status, created_at);

      CREATE TABLE push_tokens (
        token      text PRIMARY KEY,
        user_id    text NOT NULL REFERENCES users(id),
        platform   text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE settings (
        key        text PRIMARY KEY,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text REFERENCES users(id)
      );
    `,
  },
  {
    // Согласие на обработку персональных данных при первом входе в приложение (docs/TZ.md, 9.1)
    id: 6,
    sql: () => `ALTER TABLE users ADD COLUMN consent_at timestamptz;`,
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
