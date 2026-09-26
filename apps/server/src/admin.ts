import { normalizePhone, roundPriceRub, type ItemKind, type TaxStatus } from "@ks/core";
import type { Db, Queryable } from "./db";
import { loadPriceItems } from "./pricing";
import { ApiError, newId } from "./util";

type ServiceRow = {
  id: string;
  category: string;
  name: string;
  unit: string;
  kind: ItemKind;
  price: string | null;
  cost: string | null;
  active: boolean;
  sort: number;
};

const service = (s: ServiceRow) => ({ ...s, price: s.price === null ? null : Number(s.price), cost: s.cost === null ? null : Number(s.cost) });

export class CatalogService {
  constructor(private db: Db) {}

  /** Цены работ для сайта: материалы и оборудование показываются только в расчёте калькулятора. */
  async publicList() {
    const rows = await this.db.query<Pick<ServiceRow, "id" | "category" | "name" | "unit" | "price">>(
      `SELECT id, category, name, unit, price FROM services WHERE active AND kind = 'work' ORDER BY sort`,
    );
    return rows.map((s) => ({ ...s, price: s.price === null ? null : Number(s.price) }));
  }

  /** Прайс для калькулятора на сайте — без закупочных цен. */
  async calculatorPrices() {
    return (await loadPriceItems(this.db)).map(({ cost: _cost, serviceId: _id, ...item }) => item);
  }

  async adminList() {
    return (await this.db.query<ServiceRow>(`SELECT id, category, name, unit, kind, price, cost, active, sort FROM services ORDER BY sort`)).map(service);
  }

  async create(input: { category: string; name: string; unit: string; kind: ItemKind; price: number | null; cost: number | null }) {
    const [{ max }] = await this.db.query<{ max: number | null }>(`SELECT max(sort) AS max FROM services`);
    const [row] = await this.db.query<ServiceRow>(
      `INSERT INTO services (id, category, name, unit, kind, price, cost, sort) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [newId("svc"), input.category, input.name, input.unit, input.kind, input.price, input.kind === "work" ? null : input.cost, (max ?? 0) + 10],
    );
    return service(row);
  }

  async update(id: string, patch: Partial<{ name: string; price: number | null; cost: number | null; active: boolean; sort: number }>) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const k of ["name", "price", "cost", "active", "sort"] as const) {
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

  /** Все цены направления (или всего прайса) на процент, с округлением до «красивых» сумм. */
  async reprice(percent: number, category?: string) {
    await this.db.tx(async (q) => {
      const rows = await q.query<{ id: string; price: string }>(
        `SELECT id, price FROM services WHERE price IS NOT NULL${category ? " AND category = $1" : ""}`,
        category ? [category] : [],
      );
      for (const r of rows) {
        const rub = roundPriceRub((Number(r.price) / 100) * (1 + percent / 100));
        await q.query(`UPDATE services SET price = $1 WHERE id = $2`, [Math.max(rub, 0) * 100, r.id]);
      }
    });
    return this.adminList();
  }
}

type MasterRow = {
  id: string;
  phone: string;
  name: string;
  skills: string[];
  tax_status: TaxStatus;
  inn: string;
  contract_no: string;
  contract_at: string | null;
  npd_checked_at: string | null;
  note: string;
  active: boolean;
  available: boolean;
  available_at: Date | null;
  is_lead: boolean;
  lead_id: string | null;
  lead_name: string | null;
  team_size: number;
  active_jobs: number;
  today_visits: number;
  next_visit_at: Date | null;
  to_pay: string | number;
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
  npdCheckedAt: m.npd_checked_at,
  note: m.note,
  active: m.active,
  available: m.available,
  availableAt: m.available_at,
  isLead: m.is_lead,
  lead: m.lead_id ? { id: m.lead_id, name: m.lead_name ?? "" } : null,
  teamSize: m.team_size,
  activeJobs: m.active_jobs,
  todayVisits: m.today_visits,
  nextVisitAt: m.next_visit_at,
  toPay: Number(m.to_pay),
  rate: m.rate && { mode: m.rate.mode, percent: m.rate.percent === null ? null : Number(m.rate.percent), prices: m.rate.prices, validFrom: m.rate.valid_from },
});

export type MasterInput = {
  phone: string;
  name: string;
  skills: string[];
  taxStatus: TaxStatus;
  inn: string;
  contractNo: string;
  contractAt: string | null;
  npdCheckedAt: string | null;
  note: string;
  isLead: boolean;
  leadId: string | null;
};

const ACTIVE_JOBS = `('assigned', 'accepted', 'en_route', 'on_site', 'done')`;

/** Начало сегодняшнего дня по Москве (UTC+3) — не зависит от часового пояса сервера базы. */
const MSK_TODAY = `((date_trunc('day', (now() AT TIME ZONE 'UTC') + interval '3 hours') - interval '3 hours') AT TIME ZONE 'UTC')`;

export class MasterService {
  constructor(private db: Db) {}

  private select(where: string) {
    // Текущая ставка — последняя из вступивших в силу.
    return `
      SELECT u.id, u.phone, u.name, m.skills, m.tax_status, m.available, m.available_at, m.inn, m.contract_no, to_char(m.contract_at, 'YYYY-MM-DD') AS contract_at,
             to_char(m.npd_checked_at, 'YYYY-MM-DD') AS npd_checked_at, m.note, m.active, m.is_lead, m.lead_id, lu.name AS lead_name,
             (SELECT count(*)::int FROM masters t WHERE t.lead_id = m.user_id) AS team_size,
             (SELECT count(*)::int FROM requests rq WHERE rq.master_id = m.user_id AND rq.status IN ${ACTIVE_JOBS} AND rq.deleted_at IS NULL) AS active_jobs,
             (SELECT count(*)::int FROM requests rq WHERE rq.master_id = m.user_id AND rq.status IN ${ACTIVE_JOBS} AND rq.deleted_at IS NULL
                AND rq.visit_at >= ${MSK_TODAY} AND rq.visit_at < ${MSK_TODAY} + interval '1 day') AS today_visits,
             (SELECT min(rq.visit_at) FROM requests rq WHERE rq.master_id = m.user_id AND rq.status IN ${ACTIVE_JOBS} AND rq.deleted_at IS NULL
                AND rq.visit_at >= now()) AS next_visit_at,
             (SELECT COALESCE(sum(p.amount), 0) FROM payouts p WHERE p.master_id = m.user_id AND p.status = 'accrued') AS to_pay,
             (SELECT json_build_object('mode', r.mode, 'percent', r.percent, 'prices', r.prices, 'valid_from', to_char(r.valid_from, 'YYYY-MM-DD'))
              FROM master_rates r WHERE r.master_id = m.user_id AND r.valid_from <= current_date
              ORDER BY r.valid_from DESC, r.created_at DESC LIMIT 1) AS rate
      FROM masters m JOIN users u ON u.id = m.user_id LEFT JOIN users lu ON lu.id = m.lead_id ${where}`;
  }

  async list() {
    return (await this.db.query<MasterRow>(`${this.select("")} ORDER BY m.active DESC, m.is_lead DESC, u.name`)).map(master);
  }

  async get(id: string) {
    const [row] = await this.db.query<MasterRow>(this.select("WHERE m.user_id = $1"), [id]);
    if (!row) throw new ApiError(404, "not_found", "Мастер не найден");
    return master(row);
  }

  /** Бригадир — только тот, кто отмечен бригадиром; сам себе бригадиром быть нельзя. */
  private async checkLead(q: Queryable, masterId: string | null, leadId: string | null | undefined) {
    if (!leadId) return;
    if (leadId === masterId) throw new ApiError(400, "bad_lead", "Мастер не может быть бригадиром сам себе");
    const [l] = await q.query<{ is_lead: boolean }>(`SELECT is_lead FROM masters WHERE user_id = $1`, [leadId]);
    if (!l?.is_lead) throw new ApiError(400, "bad_lead", "Выбранный человек не бригадир");
  }

  async create(input: MasterInput) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new ApiError(400, "bad_phone", "Неверный телефон мастера");
    if (input.isLead && input.leadId) throw new ApiError(400, "bad_lead", "Бригадир не может быть в чужой бригаде");
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
      await this.checkLead(q, userId, input.leadId);
      await q.query(
        `INSERT INTO masters (user_id, skills, tax_status, inn, contract_no, contract_at, npd_checked_at, note, is_lead, lead_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [userId, input.skills, input.taxStatus, input.inn, input.contractNo, input.contractAt, input.npdCheckedAt, input.note, input.isLead, input.leadId],
      );
      return userId;
    });
    return this.get(id);
  }

  async update(id: string, patch: Partial<Omit<MasterInput, "phone"> & { active: boolean; available: boolean }>) {
    const current = await this.get(id);
    const cols: Record<string, string> = {
      skills: "skills",
      taxStatus: "tax_status",
      inn: "inn",
      contractNo: "contract_no",
      contractAt: "contract_at",
      npdCheckedAt: "npd_checked_at",
      note: "note",
      active: "active",
      available: "available",
      isLead: "is_lead",
      leadId: "lead_id",
    };
    const isLead = patch.isLead ?? current.isLead;
    const leadId = patch.leadId !== undefined ? patch.leadId : (current.lead?.id ?? null);
    if (isLead && leadId) throw new ApiError(400, "bad_lead", "Бригадир не может быть в чужой бригаде");
    if (patch.isLead === false && current.teamSize > 0) throw new ApiError(409, "has_team", "Сначала переведите мастеров бригады к другому бригадиру");
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || !(k in cols)) continue;
      params.push(v);
      sets.push(`${cols[k]} = $${params.length}`);
    }
    await this.db.tx(async (q) => {
      if (patch.leadId !== undefined) await this.checkLead(q, id, patch.leadId);
      if (sets.length) {
        params.push(id);
        await q.query(`UPDATE masters SET ${sets.join(", ")} WHERE user_id = $${params.length}`, params);
      }
      if (patch.name !== undefined) await q.query(`UPDATE users SET name = $1 WHERE id = $2`, [patch.name, id]);
      if (patch.available !== undefined) await q.query(`UPDATE masters SET available_at = now() WHERE user_id = $1`, [id]);
    });
    return this.get(id);
  }

  /** Мастер сам отмечает, принимает ли сейчас заказы. Владелец видит это при назначении. */
  async setAvailable(userId: string, available: boolean) {
    const [m] = await this.db.query<{ user_id: string }>(
      `UPDATE masters SET available = $1, available_at = now() WHERE user_id = $2 AND active RETURNING user_id`,
      [available, userId],
    );
    if (!m) throw new ApiError(403, "forbidden", "Отметка «Принимаю заказы» — для мастеров");
    return { available };
  }

  async setRate(id: string, rate: { mode: "percent"; percent: number; validFrom: string } | { mode: "fixed"; prices: Record<string, number>; validFrom: string }) {
    await this.get(id);
    await this.db.query(
      `INSERT INTO master_rates (id, master_id, mode, percent, prices, valid_from) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId("rate"), id, rate.mode, rate.mode === "percent" ? rate.percent : null, JSON.stringify(rate.mode === "fixed" ? rate.prices : {}), rate.validFrom],
    );
    return this.get(id);
  }

  /** Команда бригадира: он сам и его мастера, с загрузкой — сколько заданий в работе и визитов на ближайшую неделю. */
  async team(leadId: string) {
    const [lead] = await this.db.query<{ is_lead: boolean }>(`SELECT is_lead FROM masters WHERE user_id = $1`, [leadId]);
    if (!lead?.is_lead) throw new ApiError(403, "forbidden", "Раздел «Команда» — для бригадиров");
    const rows = await this.db.query<MasterRow & { week_visits: number }>(
      `${this.select("WHERE m.user_id = $1 OR m.lead_id = $1")}`.replace(
        "AS rate\n      FROM",
        `AS rate,
             (SELECT count(*)::int FROM requests rq WHERE rq.master_id = m.user_id AND rq.visit_at >= now() AND rq.visit_at < now() + interval '7 days'
                AND rq.status IN ${ACTIVE_JOBS}) AS week_visits
      FROM`,
      ),
      [leadId],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, skills: r.skills, isLead: r.is_lead, active: r.active, activeJobs: r.active_jobs, weekVisits: r.week_visits }));
  }
}
