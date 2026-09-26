import {
  canAssign,
  canTransition,
  canUnassign,
  formatRequestNumber,
  masterSeesContacts,
  normalizePhone,
  unassignTarget,
  type RequestStatus,
  type Role,
} from "@ks/core";
import type { User } from "./auth";
import type { Db, Queryable } from "./db";
import { ApiError, newId } from "./util";

type Row = {
  id: string;
  number: number;
  client_id: string;
  master_id: string | null;
  category: string;
  service_ids: string[];
  description: string;
  address: string;
  district: string;
  wanted_date: string | null;
  wanted_slot: string;
  source: string;
  status: RequestStatus;
  price_work: string | null; // bigint приходит строкой
  price_goods: string | null;
  prepaid_at: string | null;
  cancel_reason: string;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_phone: string;
  master_name: string | null;
  master_phone: string | null;
};

const SELECT = `
  SELECT r.*, to_char(r.wanted_date, 'YYYY-MM-DD') AS wanted_date,
         c.name AS client_name, c.phone AS client_phone, m.name AS master_name, m.phone AS master_phone
  FROM requests r
  JOIN users c ON c.id = r.client_id
  LEFT JOIN users m ON m.id = r.master_id
  WHERE r.deleted_at IS NULL`;

/** Как заявку видит каждая роль. Мастеру не отдаём цену для клиента никогда, а контакты клиента — только после принятия. */
function view(r: Row, as: Role) {
  const base = {
    id: r.id,
    number: formatRequestNumber(r.number),
    status: r.status,
    category: r.category,
    serviceIds: r.service_ids,
    description: r.description,
    district: r.district,
    wantedDate: r.wanted_date,
    wantedSlot: r.wanted_slot,
    createdAt: r.created_at,
  };
  if (as === "master") {
    const open = masterSeesContacts(r.status);
    return {
      ...base,
      address: open ? r.address : null,
      client: open ? { name: r.client_name, phone: r.client_phone } : null,
    };
  }
  const money = {
    priceWork: r.price_work === null ? null : Number(r.price_work),
    priceGoods: r.price_goods === null ? null : Number(r.price_goods),
  };
  const master = r.master_id ? { id: r.master_id, name: r.master_name ?? "" } : null;
  if (as === "client") return { ...base, ...money, address: r.address, cancelReason: r.cancel_reason, master };
  return {
    ...base,
    ...money,
    address: r.address,
    source: r.source,
    prepaid: r.prepaid_at !== null,
    cancelReason: r.cancel_reason,
    client: { id: r.client_id, name: r.client_name, phone: r.client_phone },
    master: master && { ...master, phone: r.master_phone ?? "" },
    updatedAt: r.updated_at,
  };
}

/** В какой роли пользователь действует с этой заявкой. null — заявка не его. */
function actorFor(user: User, r: Row): Role | null {
  if (user.roles.includes("owner")) return "owner";
  if (user.roles.includes("master") && r.master_id === user.id) return "master";
  if (r.client_id === user.id) return "client";
  return null;
}

export type NewRequest = {
  category: string;
  serviceIds: string[];
  description: string;
  address: string;
  district: string;
  wantedDate: string | null;
  wantedSlot: string;
  source: "site" | "app" | "call";
  clientPhone?: string;
  clientName?: string;
};

export class RequestService {
  constructor(private db: Db) {}

  private async load(q: Queryable, id: string): Promise<Row> {
    const [r] = await q.query<Row>(`${SELECT} AND r.id = $1`, [id]);
    if (!r) throw new ApiError(404, "not_found", "Заявка не найдена");
    return r;
  }

  private async loadFor(q: Queryable, user: User, id: string): Promise<{ r: Row; as: Role }> {
    const r = await this.load(q, id);
    const as = actorFor(user, r);
    if (!as) throw new ApiError(404, "not_found", "Заявка не найдена"); // чужую заявку не отличаем от несуществующей
    return { r, as };
  }

  private async event(q: Queryable, requestId: string, user: User, as: Role, kind: string, payload: object = {}) {
    await q.query(
      `INSERT INTO request_events (id, request_id, actor_id, actor_role, kind, payload) VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId("evt"), requestId, user.id, as, kind, JSON.stringify(payload)],
    );
  }

  async create(user: User, input: NewRequest) {
    const isOwner = user.roles.includes("owner");
    return this.db.tx(async (q) => {
      let clientId = user.id;
      let source = input.source;
      if (isOwner && input.clientPhone) {
        // Заявка по звонку: клиент заводится по телефону, если его ещё нет.
        const phone = normalizePhone(input.clientPhone);
        if (!phone) throw new ApiError(400, "bad_phone", "Неверный телефон клиента");
        const [existing] = await q.query<{ id: string }>(`SELECT id FROM users WHERE phone = $1`, [phone]);
        clientId =
          existing?.id ??
          (await q.query<{ id: string }>(`INSERT INTO users (id, phone, name) VALUES ($1, $2, $3) RETURNING id`, [newId("usr"), phone, input.clientName ?? ""]))[0].id;
        source = "call";
      } else if (source === "call") {
        source = "app";
      }
      const id = newId("req");
      await q.query(
        `INSERT INTO requests (id, client_id, category, service_ids, description, address, district, wanted_date, wanted_slot, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, clientId, input.category, input.serviceIds, input.description, input.address, input.district, input.wantedDate, input.wantedSlot, source],
      );
      await this.event(q, id, user, isOwner ? "owner" : "client", "created", { source });
      return view(await this.load(q, id), isOwner ? "owner" : "client");
    });
  }

  /**
   * Заявка с сайта без входа: имя, телефон, направление, комментарий и согласие на обработку данных.
   * Адрес и детали владелец уточняет по телефону. Клиент заводится по номеру; войти в кабинет
   * он сможет позже по коду на этот же номер и увидит там свою заявку.
   */
  async createLead(input: { name: string; phone: string; category: string; comment: string }) {
    const phone = normalizePhone(input.phone);
    if (!phone) throw new ApiError(400, "bad_phone", "Введите мобильный номер, например +7 999 123-45-67");
    return this.db.tx(async (q) => {
      const [{ n }] = await q.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM requests r JOIN users u ON u.id = r.client_id
         WHERE u.phone = $1 AND r.source = 'site' AND r.created_at > now() - interval '1 day'`,
        [phone],
      );
      if (n >= 3) throw new ApiError(429, "too_many", "Вы уже оставили заявку. Мы перезвоним");
      const [existing] = await q.query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE phone = $1 AND deleted_at IS NULL`, [phone]);
      let clientId: string;
      if (existing) {
        clientId = existing.id;
        if (!existing.name) await q.query(`UPDATE users SET name = $1 WHERE id = $2`, [input.name, clientId]);
      } else {
        clientId = newId("usr");
        await q.query(`INSERT INTO users (id, phone, name) VALUES ($1, $2, $3)`, [clientId, phone, input.name]);
      }
      const id = newId("req");
      const [{ number }] = await q.query<{ number: number }>(
        `INSERT INTO requests (id, client_id, category, description, source, consent_at) VALUES ($1, $2, $3, $4, 'site', now()) RETURNING number`,
        [id, clientId, input.category, input.comment],
      );
      await q.query(
        `INSERT INTO request_events (id, request_id, actor_id, actor_role, kind, payload) VALUES ($1, $2, $3, 'client', 'created', '{"source":"site"}')`,
        [newId("evt"), id, clientId],
      );
      return { number: formatRequestNumber(number) };
    });
  }

  async list(user: User, status?: string) {
    const params: unknown[] = [];
    let where = "";
    let as: Role;
    if (user.roles.includes("owner")) as = "owner";
    else if (user.roles.includes("master")) {
      as = "master";
      params.push(user.id);
      where += ` AND r.master_id = $${params.length}`;
    } else {
      as = "client";
      params.push(user.id);
      where += ` AND r.client_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND r.status = $${params.length}`;
    }
    const rows = await this.db.query<Row>(`${SELECT}${where} ORDER BY r.created_at DESC LIMIT 200`, params);
    return rows.map((r) => view(r, as));
  }

  /** Мастер, который тоже заказывал как клиент, видит свои заказы отдельно от заданий. */
  async listAsClient(user: User) {
    const rows = await this.db.query<Row>(`${SELECT} AND r.client_id = $1 ORDER BY r.created_at DESC LIMIT 200`, [user.id]);
    return rows.map((r) => view(r, "client"));
  }

  async get(user: User, id: string) {
    const { r, as } = await this.loadFor(this.db, user, id);
    const result: Record<string, unknown> = { ...view(r, as) };
    if (as === "owner") {
      result.events = await this.db.query(
        `SELECT e.at, e.actor_role AS "actorRole", u.name AS "actorName", e.kind, e.payload
         FROM request_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.request_id = $1 ORDER BY e.at`,
        [id],
      );
    }
    return result;
  }

  async update(user: User, id: string, patch: Partial<{ priceWork: number | null; priceGoods: number | null; description: string; address: string; district: string; wantedDate: string | null; wantedSlot: string; serviceIds: string[] }>) {
    return this.db.tx(async (q) => {
      const { r, as } = await this.loadFor(q, user, id);
      if (as !== "owner") throw new ApiError(403, "forbidden", "Изменять заявку может только владелец");
      if (r.status === "closed" || r.status === "cancelled") throw new ApiError(409, "final", "Заявка уже закрыта");
      const cols: Record<string, string> = {
        priceWork: "price_work",
        priceGoods: "price_goods",
        description: "description",
        address: "address",
        district: "district",
        wantedDate: "wanted_date",
        wantedSlot: "wanted_slot",
        serviceIds: "service_ids",
      };
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || !(k in cols)) continue;
        params.push(v);
        sets.push(`${cols[k]} = $${params.length}`);
      }
      if (sets.length) {
        params.push(id);
        await q.query(`UPDATE requests SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
        await this.event(q, id, user, as, "updated", patch);
      }
      return view(await this.load(q, id), as);
    });
  }

  async setStatus(user: User, id: string, to: RequestStatus, reason: string) {
    return this.db.tx(async (q) => {
      const { r, as } = await this.loadFor(q, user, id);
      if (!canTransition(r.status, to, as))
        throw new ApiError(409, "bad_transition", "Это действие сейчас недоступно");
      if (to === "cancelled" && !reason.trim()) throw new ApiError(400, "reason_required", "Укажите причину отмены");
      if (to === "agreed" && r.price_work === null) throw new ApiError(400, "price_required", "Сначала укажите стоимость работ");
      await q.query(
        `UPDATE requests SET status = $1, updated_at = now(),
           prepaid_at = CASE WHEN $1 = 'prepaid' THEN now() ELSE prepaid_at END,
           cancel_reason = CASE WHEN $1 = 'cancelled' THEN $2 ELSE cancel_reason END
         WHERE id = $3`,
        [to, reason.trim(), id],
      );
      await this.event(q, id, user, as, "status", { from: r.status, to, ...(reason ? { reason } : {}) });
      return view(await this.load(q, id), as);
    });
  }

  async assign(user: User, id: string, masterId: string) {
    return this.db.tx(async (q) => {
      const { r, as } = await this.loadFor(q, user, id);
      if (as !== "owner") throw new ApiError(403, "forbidden", "Назначать мастера может только владелец");
      if (!canAssign(r.status)) throw new ApiError(409, "bad_transition", "Мастера можно назначить после согласования или предоплаты");
      const [m] = await q.query<{ active: boolean }>(`SELECT active FROM masters WHERE user_id = $1`, [masterId]);
      if (!m || !m.active) throw new ApiError(400, "bad_master", "Мастер не найден или отключён");
      await q.query(`UPDATE requests SET master_id = $1, status = 'assigned', updated_at = now() WHERE id = $2`, [masterId, id]);
      await this.event(q, id, user, as, "assigned", { masterId });
      return view(await this.load(q, id), as);
    });
  }

  /** Отказ мастера от задания или снятие мастера владельцем. */
  async unassign(user: User, id: string, reason: string) {
    return this.db.tx(async (q) => {
      const { r, as } = await this.loadFor(q, user, id);
      if (!canUnassign(r.status, as)) throw new ApiError(409, "bad_transition", "Это действие сейчас недоступно");
      const to = unassignTarget(r.prepaid_at !== null);
      await q.query(`UPDATE requests SET master_id = NULL, status = $1, updated_at = now() WHERE id = $2`, [to, id]);
      await this.event(q, id, user, as, as === "master" ? "declined" : "unassigned", { masterId: r.master_id, reason });
      // Мастер после отказа заявку больше не видит — отдаём ему только итог.
      return as === "master" ? { ok: true } : view(await this.load(q, id), as);
    });
  }
}
