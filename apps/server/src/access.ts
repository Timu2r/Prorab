import type { RequestStatus } from "@ks/core";
import type { User } from "./auth";
import type { Queryable } from "./db";
import { ApiError } from "./util";

/** В какой роли человек действует с конкретной заявкой. lead — бригадир по заданию своего мастера. */
export type Actor = "owner" | "lead" | "master" | "client";

export type RequestRow = {
  id: string;
  number: number;
  client_id: string;
  master_id: string | null;
  category: string;
  service_ids: string[];
  description: string;
  address: string;
  apartment: string;
  entrance: string;
  floor: string;
  intercom: string;
  district: string;
  wanted_date: string | null;
  wanted_slot: string;
  visit_at: Date | null;
  visit_until: Date | null;
  source: string;
  utm: Record<string, string> | null;
  /** Заявка с сайта: консультация или подробная. null — заведена владельцем или клиентом в приложении. */
  lead_type: "consult" | "full" | null;
  /** Ответы калькулятора и расчёт на момент заявки с сайта. */
  calc: { id: string; answers: Record<string, string | number | boolean>; totals: { total: number; work: number; goods: number; reserve: number }; notes: { tone: string; text: string }[] } | null;
  status: RequestStatus;
  price_work: string | number | null; // bigint приходит строкой
  price_goods: string | number | null;
  prepaid_at: Date | null;
  done_at: Date | null;
  act_signed_at: Date | null;
  paid_at: Date | null;
  closed_at: Date | null;
  warranty_until: string | null;
  cancel_reason: string;
  refund_required: boolean;
  owner_note: string;
  rating: number | null;
  review: string;
  created_at: Date;
  updated_at: Date;
  client_name: string;
  client_phone: string;
  master_name: string | null;
  master_phone: string | null;
};

export const REQUEST_SELECT = `
  SELECT r.*, to_char(r.wanted_date, 'YYYY-MM-DD') AS wanted_date, to_char(r.warranty_until, 'YYYY-MM-DD') AS warranty_until,
         c.name AS client_name, c.phone AS client_phone, m.name AS master_name, m.phone AS master_phone
  FROM requests r
  JOIN users c ON c.id = r.client_id
  LEFT JOIN users m ON m.id = r.master_id
  WHERE r.deleted_at IS NULL`;

/** Мастер и его команда. У обычного мастера команда — он сам. */
export type MasterInfo = { isLead: boolean; team: string[] };

export async function masterInfo(q: Queryable, user: User): Promise<MasterInfo | null> {
  if (!user.roles.includes("master")) return null;
  const [m] = await q.query<{ is_lead: boolean }>(`SELECT is_lead FROM masters WHERE user_id = $1`, [user.id]);
  if (!m) return null;
  if (!m.is_lead) return { isLead: false, team: [user.id] };
  const rows = await q.query<{ user_id: string }>(`SELECT user_id FROM masters WHERE lead_id = $1 OR user_id = $1`, [user.id]);
  return { isLead: true, team: rows.map((r) => r.user_id) };
}

export function actorFor(user: User, r: Pick<RequestRow, "client_id" | "master_id">, mi: MasterInfo | null): Actor | null {
  if (user.roles.includes("owner")) return "owner";
  if (mi && r.master_id) {
    if (r.master_id === user.id) return "master";
    if (mi.isLead && mi.team.includes(r.master_id)) return "lead";
  }
  if (r.client_id === user.id) return "client";
  return null;
}

export async function loadRequest(q: Queryable, id: string): Promise<RequestRow> {
  const [r] = await q.query<RequestRow>(`${REQUEST_SELECT} AND r.id = $1`, [id]);
  if (!r) throw new ApiError(404, "not_found", "Заявка не найдена");
  return r;
}

/** Заявка и роль, в которой человек с ней работает. Чужую заявку не отличаем от несуществующей. */
export async function loadFor(q: Queryable, user: User, id: string): Promise<{ r: RequestRow; as: Actor; mi: MasterInfo | null }> {
  const r = await loadRequest(q, id);
  const mi = await masterInfo(q, user);
  const as = actorFor(user, r, mi);
  if (!as) throw new ApiError(404, "not_found", "Заявка не найдена");
  return { r, as, mi };
}

export function mustBe(as: Actor, ...allowed: Actor[]): void {
  if (!allowed.includes(as)) throw new ApiError(403, "forbidden", "Это действие вам недоступно");
}

export const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function isFinal(r: Pick<RequestRow, "status">): boolean {
  return r.status === "closed" || r.status === "cancelled";
}
