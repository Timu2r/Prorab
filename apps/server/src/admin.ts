import { normalizePhone } from "@ks/core";
import type { Db } from "./db";
import { ApiError, newId } from "./util";

type ServiceRow = { id: string; category: string; name: string; unit: string; price: string | null; active: boolean; sort: number };

const service = (s: ServiceRow) => ({ ...s, price: s.price === null ? null : Number(s.price) });

export class CatalogService {
  constructor(private db: Db) {}

  async publicList() {
    const rows = await this.db.query<Omit<ServiceRow, "active" | "sort">>(
      `SELECT id, category, name, unit, price FROM services WHERE active ORDER BY sort`,
    );
    return rows.map((s) => ({ ...s, price: s.price === null ? null : Number(s.price) }));
  }

  async adminList() {
    return (await this.db.query<ServiceRow>(`SELECT id, category, name, unit, price, active, sort FROM services ORDER BY sort`)).map(service);
  }

  async create(input: { category: string; name: string; unit: string; price: number | null }) {
    const [{ max }] = await this.db.query<{ max: number | null }>(`SELECT max(sort) AS max FROM services`);
    const [row] = await this.db.query<ServiceRow>(
      `INSERT INTO services (id, category, name, unit, price, sort) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [newId("svc"), input.category, input.name, input.unit, input.price, (max ?? 0) + 10],
    );
    return service(row);
  }

  async update(id: string, patch: Partial<{ name: string; price: number | null; active: boolean; sort: number }>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const k of ["name", "price", "active", "sort"] as const) {
      if (patch[k] === undefined) continue;
      params.push(patch[k]);
      sets.push(`${k} = $${params.length}`);
    }
    if (!sets.length) throw new ApiError(400, "empty", "Нечего менять");
    params.push(id);
    const [row] = await this.db.query<ServiceRow>(`UPDATE services SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (!row) throw new ApiError(404, "not_found", "Позиция не найдена");
    return service(row);
  }
}

type MasterRow = {
  id: string;
  phone: string;
  name: string;
  skills: string[];
  tax_status: "npd" | "ip";
  inn: string;
  contract_no: string;
  contract_at: string | null;
  note: string;
  active: boolean;
  rate: { mode: "percent" | "fixed"; percent: string | null; prices: Record<string, number>; valid_from: string } | null;
};

const master = (m: MasterRow) => ({
  id: m.id,
  phone: m.phone,
  name: m.name,
  skills: m.skills,
  taxStatus: m.tax_status,
  inn: m.inn,
  contractNo: m.contract_no,
  contractAt: m.contract_at,
  note: m.note,
  active: m.active,
  rate: m.rate && { mode: m.rate.mode, percent: m.rate.percent === null ? null : Number(m.rate.percent), prices: m.rate.prices, validFrom: m.rate.valid_from },
});

export type MasterInput = {
  phone: string;
  name: string;
  skills: string[];
  taxStatus: "npd" | "ip";
  inn: string;
  contractNo: string;
  contractAt: string | null;
  note: string;
};

export class MasterService {
  constructor(private db: Db) {}

  private select(where: string) {
    // Текущая ставка — последняя из вступивших в силу.
    return `
      SELECT u.id, u.phone, u.name, m.skills, m.tax_status, m.inn, m.contract_no, to_char(m.contract_at, 'YYYY-MM-DD') AS contract_at,
             m.note, m.active,
             (SELECT json_build_object('mode', r.mode, 'percent', r.percent, 'prices', r.prices, 'valid_from', to_char(r.valid_from, 'YYYY-MM-DD'))
              FROM master_rates r WHERE r.master_id = m.user_id AND r.valid_from <= current_date
              ORDER BY r.valid_from DESC, r.created_at DESC LIMIT 1) AS rate
      FROM masters m JOIN users u ON u.id = m.user_id ${where}`;
  }

  async list() {
    return (await this.db.query<MasterRow>(`${this.select("")} ORDER BY m.active DESC, u.name`)).map(master);
  }

  async get(id: string) {
    const [row] = await this.db.query<MasterRow>(this.select("WHERE m.user_id = $1"), [id]);
    if (!row) throw new ApiError(404, "not_found", "Мастер не найден");
    return master(row);
  }

  async create(input: MasterInput) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new ApiError(400, "bad_phone", "Неверный телефон мастера");
    const id = await this.db.tx(async (q) => {
      const [existing] = await q.query<{ id: string; roles: string[] }>(`SELECT id, roles FROM users WHERE phone = $1 AND deleted_at IS NULL`, [phone]);
      let userId: string;
      if (existing) {
        userId = existing.id;
        const [already] = await q.query(`SELECT 1 FROM masters WHERE user_id = $1`, [userId]);
        if (already) throw new ApiError(409, "exists", "Этот человек уже есть в списке мастеров");
        await q.query(
          `UPDATE users SET roles = CASE WHEN 'master' = ANY(roles) THEN roles ELSE array_append(roles, 'master') END,
                            name = CASE WHEN name = '' THEN $2 ELSE name END WHERE id = $1`,
          [userId, input.name],
        );
      } else {
        userId = newId("usr");
        await q.query(`INSERT INTO users (id, phone, name, roles) VALUES ($1, $2, $3, '{client,master}')`, [userId, phone, input.name]);
      }
      await q.query(
        `INSERT INTO masters (user_id, skills, tax_status, inn, contract_no, contract_at, note) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, input.skills, input.taxStatus, input.inn, input.contractNo, input.contractAt, input.note],
      );
      return userId;
    });
    return this.get(id);
  }

  async update(id: string, patch: Partial<Omit<MasterInput, "phone"> & { active: boolean }>) {
    await this.get(id);
    const cols: Record<string, string> = {
      skills: "skills",
      taxStatus: "tax_status",
      inn: "inn",
      contractNo: "contract_no",
      contractAt: "contract_at",
      note: "note",
      active: "active",
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || !(k in cols)) continue;
      params.push(v);
      sets.push(`${cols[k]} = $${params.length}`);
    }
    await this.db.tx(async (q) => {
      if (sets.length) {
        params.push(id);
        await q.query(`UPDATE masters SET ${sets.join(", ")} WHERE user_id = $${params.length}`, params);
      }
      if (patch.name !== undefined) await q.query(`UPDATE users SET name = $1 WHERE id = $2`, [patch.name, id]);
    });
    return this.get(id);
  }

  async setRate(id: string, rate: { mode: "percent"; percent: number; validFrom: string } | { mode: "fixed"; prices: Record<string, number>; validFrom: string }) {
    await this.get(id);
    await this.db.query(
      `INSERT INTO master_rates (id, master_id, mode, percent, prices, valid_from) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId("rate"), id, rate.mode, rate.mode === "percent" ? rate.percent : null, JSON.stringify(rate.mode === "fixed" ? rate.prices : {}), rate.validFrom],
    );
    return this.get(id);
  }
}
