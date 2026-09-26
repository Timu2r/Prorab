import { formatRequestNumber, type RequestStatus } from "@ks/core";
import type { Db, Queryable } from "./db";
import { ApiError } from "./util";

type ClientRow = {
  id: string;
  name: string;
  phone: string;
  created_at: Date;
  type: "person" | "company";
  company_name: string;
  inn: string;
  kpp: string;
  note: string;
  requests: number;
  paid: string | number;
  last_request_at: Date | null;
};

export type ClientProfilePatch = Partial<{ type: "person" | "company"; companyName: string; inn: string; kpp: string; note: string }>;

const SELECT = `
  SELECT u.id, u.name, u.phone, u.created_at,
         COALESCE(p.type, 'person') AS type, COALESCE(p.company_name, '') AS company_name,
         COALESCE(p.inn, '') AS inn, COALESCE(p.kpp, '') AS kpp, COALESCE(p.note, '') AS note,
         (SELECT count(*)::int FROM requests r WHERE r.client_id = u.id AND r.deleted_at IS NULL) AS requests,
         (SELECT COALESCE(sum(i.amount), 0) FROM invoices i JOIN requests r ON r.id = i.request_id WHERE r.client_id = u.id AND i.status = 'paid') AS paid,
         (SELECT max(r.created_at) FROM requests r WHERE r.client_id = u.id AND r.deleted_at IS NULL) AS last_request_at
  FROM users u LEFT JOIN client_profiles p ON p.user_id = u.id
  WHERE u.deleted_at IS NULL`;

const view = (c: ClientRow) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  type: c.type,
  companyName: c.company_name,
  inn: c.inn,
  kpp: c.kpp,
  note: c.note,
  requests: c.requests,
  paid: Number(c.paid),
  lastRequestAt: c.last_request_at,
  createdAt: c.created_at,
});

/** Профиль клиента: физлицо или компания (для счетов компаниям). */
export async function upsertProfile(q: Queryable, userId: string, patch: ClientProfilePatch): Promise<void> {
  const [cur] = await q.query<{ type: string; company_name: string; inn: string; kpp: string; note: string }>(
    `SELECT type, company_name, inn, kpp, note FROM client_profiles WHERE user_id = $1`,
    [userId],
  );
  const next = {
    type: patch.type ?? cur?.type ?? "person",
    companyName: patch.companyName ?? cur?.company_name ?? "",
    inn: patch.inn ?? cur?.inn ?? "",
    kpp: patch.kpp ?? cur?.kpp ?? "",
    note: patch.note ?? cur?.note ?? "",
  };
  await q.query(
    `INSERT INTO client_profiles (user_id, type, company_name, inn, kpp, note) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET type = EXCLUDED.type, company_name = EXCLUDED.company_name, inn = EXCLUDED.inn, kpp = EXCLUDED.kpp, note = EXCLUDED.note`,
    [userId, next.type, next.companyName, next.inn, next.kpp, next.note],
  );
}

export class ClientService {
  constructor(private db: Db) {}

  /** Все, кто хоть раз оставлял заявку. Поиск по имени, телефону, названию компании. */
  async list(search?: string) {
    const text = search?.trim();
    const params: unknown[] = [];
    let where = ` AND EXISTS (SELECT 1 FROM requests r WHERE r.client_id = u.id AND r.deleted_at IS NULL)`;
    if (text) {
      const digits = text.replace(/\D/g, "");
      params.push(`%${text}%`, digits ? `%${digits}%` : "\u0000");
      where += ` AND (u.name ILIKE $1 OR p.company_name ILIKE $1 OR u.phone LIKE $2)`;
    }
    const rows = await this.db.query<ClientRow>(`${SELECT}${where} ORDER BY last_request_at DESC NULLS LAST LIMIT 300`, params);
    return rows.map(view);
  }

  async get(id: string) {
    const [c] = await this.db.query<ClientRow>(`${SELECT} AND u.id = $1`, [id]);
    if (!c) throw new ApiError(404, "not_found", "Клиент не найден");
    const requests = await this.db.query<{ id: string; number: number; status: RequestStatus; category: string; created_at: Date; price_work: string | null; price_goods: string | null }>(
      `SELECT id, number, status, category, created_at, price_work, price_goods FROM requests WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [id],
    );
    return {
      ...view(c),
      history: requests.map((r) => ({
        id: r.id,
        number: formatRequestNumber(r.number),
        status: r.status,
        category: r.category,
        createdAt: r.created_at,
        total: r.price_work === null && r.price_goods === null ? null : Number(r.price_work ?? 0) + Number(r.price_goods ?? 0),
      })),
    };
  }

  async patch(id: string, patch: ClientProfilePatch) {
    const [u] = await this.db.query(`SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!u) throw new ApiError(404, "not_found", "Клиент не найден");
    await upsertProfile(this.db, id, patch);
    return this.get(id);
  }
}
