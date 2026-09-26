import { estimateTotals, type EstimateStatus, type ItemKind } from "@ks/core";
import { isFinal, loadFor, mustBe, num } from "./access";
import type { User } from "./auth";
import type { Db, Queryable } from "./db";
import { logEvent, syncStatus } from "./flow";
import { ApiError, newId } from "./util";

type EstimateRow = {
  id: string;
  request_id: string;
  version: number;
  status: EstimateStatus;
  reserve_percent: string | number;
  note: string;
  created_at: Date;
  sent_at: Date | null;
  approved_at: Date | null;
  reject_reason: string;
};

type ItemRow = {
  id: string;
  estimate_id: string;
  kind: ItemKind;
  service_id: string | null;
  name: string;
  unit: string;
  qty: string | number;
  price: string | number;
  cost: string | number | null;
  used_qty: string | number | null;
};

export type EstimateItemInput = {
  kind: ItemKind;
  serviceId: string | null;
  name: string;
  unit: string;
  qty: number;
  price: number;
  cost: number | null;
};

/** Все версии сметы заявки с позициями и итогами. */
export async function loadEstimates(q: Queryable, requestId: string) {
  const rows = await q.query<EstimateRow>(`SELECT * FROM estimates WHERE request_id = $1 ORDER BY version`, [requestId]);
  if (!rows.length) return [];
  const items = await q.query<ItemRow>(
    `SELECT i.* FROM estimate_items i JOIN estimates e ON e.id = i.estimate_id WHERE e.request_id = $1 ORDER BY i.sort, i.id`,
    [requestId],
  );
  return rows.map((e) => {
    const its = items
      .filter((i) => i.estimate_id === e.id)
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        serviceId: i.service_id,
        name: i.name,
        unit: i.unit,
        qty: Number(i.qty),
        price: Number(i.price),
        cost: num(i.cost),
        usedQty: num(i.used_qty),
      }));
    const reservePercent = Number(e.reserve_percent);
    return {
      id: e.id,
      version: e.version,
      status: e.status,
      reservePercent,
      note: e.note,
      createdAt: e.created_at,
      sentAt: e.sent_at,
      approvedAt: e.approved_at,
      rejectReason: e.reject_reason,
      items: its,
      totals: estimateTotals(its, reservePercent),
    };
  });
}

export type EstimateFull = Awaited<ReturnType<typeof loadEstimates>>[number];

/** Смета для клиента: без закупочных цен, себестоимости и черновиков. */
export function clientEstimate(e: EstimateFull) {
  const { cost: _cost, ...totals } = e.totals;
  return { ...e, items: e.items.map(({ cost: _c, usedQty: _u, ...i }) => i), totals };
}

export async function approvedEstimate(q: Queryable, requestId: string): Promise<EstimateFull | null> {
  return (await loadEstimates(q, requestId)).find((e) => e.status === "approved") ?? null;
}

export class EstimateService {
  constructor(private db: Db) {}

  async list(user: User, requestId: string) {
    const { as } = await loadFor(this.db, user, requestId);
    const all = await loadEstimates(this.db, requestId);
    if (as === "owner") return all;
    if (as === "client") return all.filter((e) => e.status !== "draft").map(clientEstimate);
    throw new ApiError(403, "forbidden", "Смета с ценами вам недоступна");
  }

  private async loadFor(q: Queryable, user: User, id: string) {
    const [e] = await q.query<EstimateRow>(`SELECT * FROM estimates WHERE id = $1`, [id]);
    if (!e) throw new ApiError(404, "not_found", "Смета не найдена");
    return { e, ...(await loadFor(q, user, e.request_id)) };
  }

  private async one(q: Queryable, requestId: string, id: string): Promise<EstimateFull> {
    return (await loadEstimates(q, requestId)).find((x) => x.id === id)!;
  }

  /** Новая версия — копия последней. Черновик может быть только один. */
  async createVersion(user: User, requestId: string) {
    return this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, requestId);
      mustBe(as, "owner");
      if (isFinal(r)) throw new ApiError(409, "final", "Заявка уже закрыта");
      const all = await loadEstimates(q, requestId);
      if (all.some((e) => e.status === "draft")) throw new ApiError(409, "draft_exists", "Черновик сметы уже есть");
      const last = all.at(-1);
      const id = newId("est");
      await q.query(`INSERT INTO estimates (id, request_id, version, reserve_percent, note, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [
        id,
        requestId,
        (last?.version ?? 0) + 1,
        last?.reservePercent ?? 0,
        last?.note ?? "",
        user.id,
      ]);
      for (const [i, it] of (last?.items ?? []).entries()) await insertItem(q, id, i, it);
      return this.one(q, requestId, id);
    });
  }

  async saveDraft(user: User, id: string, input: { reservePercent?: number; note?: string; items: EstimateItemInput[] }) {
    return this.db.tx(async (q) => {
      const { e, as } = await this.loadFor(q, user, id);
      mustBe(as, "owner");
      if (e.status !== "draft") throw new ApiError(409, "not_draft", "Менять можно только черновик. Создайте новую версию сметы");
      const ids = [...new Set(input.items.map((i) => i.serviceId).filter((x): x is string => !!x))];
      if (ids.length) {
        const found = await q.query<{ id: string }>(`SELECT id FROM services WHERE id = ANY($1::text[])`, [ids]);
        if (found.length !== ids.length) throw new ApiError(400, "bad_service", "Позиция прайса не найдена");
      }
      await q.query(`DELETE FROM estimate_items WHERE estimate_id = $1`, [id]);
      for (const [i, it] of input.items.entries()) await insertItem(q, id, i, it);
      await q.query(`UPDATE estimates SET reserve_percent = COALESCE($1, reserve_percent), note = COALESCE($2, note) WHERE id = $3`, [
        input.reservePercent ?? null,
        input.note ?? null,
        id,
      ]);
      return this.one(q, e.request_id, id);
    });
  }

  async send(user: User, id: string) {
    return this.db.tx(async (q) => {
      const { e, as } = await this.loadFor(q, user, id);
      mustBe(as, "owner");
      if (e.status !== "draft") throw new ApiError(409, "not_draft", "Смета уже отправлена");
      await requireItems(q, id);
      // Старая неутверждённая версия у клиента больше не действует
      await q.query(`UPDATE estimates SET status = 'superseded' WHERE request_id = $1 AND status = 'sent'`, [e.request_id]);
      await q.query(`UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1`, [id]);
      await logEvent(q, e.request_id, { userId: user.id, role: "owner" }, "estimate_sent", { estimateId: id, version: e.version });
      return this.one(q, e.request_id, id);
    });
  }

  /** Клиент утверждает отправленную смету; владелец — черновик или отправленную («согласовано по телефону»). */
  async approve(user: User, id: string) {
    return this.db.tx(async (q) => {
      const { e, as } = await this.loadFor(q, user, id);
      mustBe(as, "owner", "client");
      const allowed: EstimateStatus[] = as === "owner" ? ["draft", "sent"] : ["sent"];
      if (!allowed.includes(e.status)) throw new ApiError(409, "bad_estimate_status", "Эту смету нельзя согласовать");
      await requireItems(q, id);
      await q.query(`UPDATE estimates SET status = 'superseded' WHERE request_id = $1 AND status IN ('approved', 'sent') AND id <> $2`, [e.request_id, id]);
      await q.query(`UPDATE estimates SET status = 'approved', approved_at = now(), approved_by = $2, sent_at = COALESCE(sent_at, now()) WHERE id = $1`, [
        id,
        user.id,
      ]);
      const full = await this.one(q, e.request_id, id);
      await q.query(`UPDATE requests SET price_work = $1, price_goods = $2, updated_at = now() WHERE id = $3`, [full.totals.work, full.totals.goods, e.request_id]);
      const by = { userId: user.id, role: as };
      await logEvent(q, e.request_id, by, "estimate_approved", { estimateId: id, version: e.version, byPhone: as === "owner" });
      await syncStatus(q, e.request_id, by);
      return as === "owner" ? full : clientEstimate(full);
    });
  }

  async reject(user: User, id: string, reason: string) {
    return this.db.tx(async (q) => {
      const { e, as } = await this.loadFor(q, user, id);
      mustBe(as, "client");
      if (e.status !== "sent") throw new ApiError(409, "bad_estimate_status", "Эту смету нельзя отклонить");
      if (!reason.trim()) throw new ApiError(400, "reason_required", "Напишите, что не устроило в смете");
      await q.query(`UPDATE estimates SET status = 'rejected', reject_reason = $2 WHERE id = $1`, [id, reason.trim()]);
      await logEvent(q, e.request_id, { userId: user.id, role: "client" }, "estimate_rejected", { estimateId: id, reason: reason.trim() });
      return clientEstimate(await this.one(q, e.request_id, id));
    });
  }
}

async function insertItem(q: Queryable, estimateId: string, sort: number, it: EstimateItemInput): Promise<void> {
  await q.query(
    `INSERT INTO estimate_items (id, estimate_id, kind, service_id, name, unit, qty, price, cost, sort) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [newId("itm"), estimateId, it.kind, it.serviceId, it.name, it.unit, it.qty, it.price, it.kind === "work" ? null : it.cost, sort],
  );
}

async function requireItems(q: Queryable, estimateId: string): Promise<void> {
  const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM estimate_items WHERE estimate_id = $1`, [estimateId]);
  if (!n) throw new ApiError(400, "empty", "В смете нет позиций");
}
