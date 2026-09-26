import { formatRequestNumber, masterPay, type MasterRate, type PayoutKind, type PayoutMethod, type PayoutStatus, type WorkLine } from "@ks/core";
import type { RequestRow } from "./access";
import type { User } from "./auth";
import type { Db, Queryable } from "./db";
import type { FileService } from "./files";
import { logEvent, type By } from "./flow";
import { moscowDate, moscowMonth } from "./time";
import { ApiError, newId } from "./util";

/** Ставка мастера, действовавшая на дату. */
export async function rateAt(q: Queryable, masterId: string, date: string): Promise<MasterRate | null> {
  const [r] = await q.query<{ mode: "percent" | "fixed"; percent: string | null; prices: Record<string, number> }>(
    `SELECT mode, percent, prices FROM master_rates WHERE master_id = $1 AND valid_from <= $2::date ORDER BY valid_from DESC, created_at DESC LIMIT 1`,
    [masterId, date],
  );
  if (!r) return null;
  return r.mode === "percent" ? { mode: "percent", percent: Number(r.percent) } : { mode: "fixed", prices: r.prices };
}

/** Работы утверждённой сметы по заявкам: для расчёта выплаты. Свои строки без позиции прайса — serviceId пустой. */
export async function workLines(q: Queryable, requestIds: string[]): Promise<Map<string, WorkLine[]>> {
  const out = new Map<string, WorkLine[]>();
  if (!requestIds.length) return out;
  const rows = await q.query<{ request_id: string; service_id: string | null; qty: string; price: string }>(
    `SELECT e.request_id, i.service_id, i.qty, i.price FROM estimate_items i JOIN estimates e ON e.id = i.estimate_id
     WHERE e.status = 'approved' AND i.kind = 'work' AND e.request_id = ANY($1::text[])`,
    [requestIds],
  );
  for (const r of rows) {
    const list = out.get(r.request_id) ?? [];
    list.push({ serviceId: r.service_id ?? "", qty: Number(r.qty), clientPrice: Number(r.price) });
    out.set(r.request_id, list);
  }
  return out;
}

/** Сколько получит мастер по текущей ставке. null — ставки нет или позиции нет в прайсе мастера. */
export async function payForecast(q: Queryable, masterId: string, requestIds: string[]): Promise<Map<string, number | null>> {
  const rate = await rateAt(q, masterId, moscowDate());
  const lines = await workLines(q, requestIds);
  return new Map(requestIds.map((id) => [id, rate ? masterPay(rate, lines.get(id) ?? []) : null]));
}

/** Начисление при закрытии заявки — по ставке на дату «Работы выполнены» (docs/TZ.md, 6.3). */
export async function accruePayout(q: Queryable, r: RequestRow, by: By): Promise<void> {
  if (!r.master_id) return;
  const rate = await rateAt(q, r.master_id, moscowDate(r.done_at ? new Date(r.done_at) : new Date()));
  const lines = (await workLines(q, [r.id])).get(r.id) ?? [];
  const amount = rate ? masterPay(rate, lines) : null;
  const id = newId("pay");
  await q.query(
    `INSERT INTO payouts (id, master_id, request_id, kind, amount, needs_amount, created_by) VALUES ($1, $2, $3, 'work', $4, $5, $6)`,
    [id, r.master_id, r.id, amount ?? 0, amount === null, by.userId],
  );
  await logEvent(q, r.id, by, "payout_accrued", { payoutId: id, amount, needsAmount: amount === null });
}

type PayoutRow = {
  id: string;
  master_id: string;
  master_name: string;
  tax_status: string;
  request_id: string | null;
  request_number: number | null;
  kind: PayoutKind;
  amount: string | number;
  needs_amount: boolean;
  reason: string;
  status: PayoutStatus;
  accrued_at: Date;
  paid_at: Date | null;
  method: PayoutMethod | null;
  receipt_url: string;
  receipt_file: string | null;
};

const SELECT = `
  SELECT p.*, u.name AS master_name, m.tax_status, r.number AS request_number,
         (SELECT f.id FROM files f WHERE f.payout_id = p.id AND f.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 1) AS receipt_file
  FROM payouts p
  JOIN masters m ON m.user_id = p.master_id
  JOIN users u ON u.id = p.master_id
  LEFT JOIN requests r ON r.id = p.request_id`;

export class PayoutService {
  constructor(
    private db: Db,
    private files: FileService,
  ) {}

  private view = (p: PayoutRow) => ({
    id: p.id,
    master: { id: p.master_id, name: p.master_name, taxStatus: p.tax_status },
    requestId: p.request_id,
    requestNumber: p.request_number === null ? null : formatRequestNumber(p.request_number),
    kind: p.kind,
    amount: Number(p.amount),
    needsAmount: p.needs_amount,
    reason: p.reason,
    status: p.status,
    accruedAt: p.accrued_at,
    paidAt: p.paid_at,
    method: p.method,
    receiptUrl: p.receipt_url,
    receiptFileUrl: p.receipt_file ? this.files.url(p.receipt_file) : null,
    receiptMissing: p.status === "paid" && p.tax_status === "npd" && !p.receipt_url && !p.receipt_file,
  });

  async forRequest(q: Queryable, requestId: string) {
    return (await q.query<PayoutRow>(`${SELECT} WHERE p.request_id = $1 ORDER BY p.accrued_at`, [requestId])).map(this.view);
  }

  /** Мастер видит свои выплаты, владелец — все. Итоги: начислено, выплачено, к выплате. */
  async list(user: User, f: { status?: PayoutStatus; masterId?: string; month?: string }) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (!user.roles.includes("owner")) {
      params.push(user.id);
      where.push(`p.master_id = $${params.length}`);
    } else if (f.masterId) {
      params.push(f.masterId);
      where.push(`p.master_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`p.status = $${params.length}`);
    }
    if (f.month) {
      const { start, end } = moscowMonth(f.month);
      params.push(start, end);
      where.push(`p.accrued_at >= $${params.length - 1} AND p.accrued_at < $${params.length}`);
    }
    const rows = await this.db.query<PayoutRow>(`${SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY p.accrued_at DESC LIMIT 500`, params);
    const payouts = rows.map(this.view);
    const live = payouts.filter((p) => p.status !== "cancelled");
    const sum = (list: typeof payouts) => list.reduce((s, p) => s + p.amount, 0);
    return {
      payouts,
      totals: { accrued: sum(live), paid: sum(live.filter((p) => p.status === "paid")), toPay: sum(live.filter((p) => p.status === "accrued")) },
    };
  }

  private async one(q: Queryable, id: string) {
    const [p] = await q.query<PayoutRow>(`${SELECT} WHERE p.id = $1`, [id]);
    if (!p) throw new ApiError(404, "not_found", "Выплата не найдена");
    return p;
  }

  /** Удержание или доплата. Сумма вводится положительной, удержание записывается с минусом. */
  async createManual(user: User, input: { masterId: string; kind: "deduction" | "bonus"; amount: number; reason: string; requestId?: string }) {
    return this.db.tx(async (q) => {
      const [m] = await q.query(`SELECT 1 FROM masters WHERE user_id = $1`, [input.masterId]);
      if (!m) throw new ApiError(400, "bad_master", "Мастер не найден");
      if (!input.reason.trim()) throw new ApiError(400, "reason_required", "Укажите причину");
      const id = newId("pay");
      const amount = input.kind === "deduction" ? -Math.abs(input.amount) : Math.abs(input.amount);
      await q.query(`INSERT INTO payouts (id, master_id, request_id, kind, amount, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        id,
        input.masterId,
        input.requestId ?? null,
        input.kind,
        amount,
        input.reason.trim(),
        user.id,
      ]);
      if (input.requestId) await logEvent(q, input.requestId, { userId: user.id, role: "owner" }, "payout_manual", { payoutId: id, kind: input.kind, amount });
      return this.view(await this.one(q, id));
    });
  }

  /** Сумма для выплаты, которую не удалось посчитать по прайсу мастера. */
  async setAmount(user: User, id: string, amount: number) {
    return this.db.tx(async (q) => {
      const p = await this.one(q, id);
      if (p.status !== "accrued") throw new ApiError(409, "not_accrued", "Выплата уже закрыта");
      await q.query(`UPDATE payouts SET amount = $1, needs_amount = false WHERE id = $2`, [amount, id]);
      if (p.request_id) await logEvent(q, p.request_id, { userId: user.id, role: "owner" }, "payout_amount", { payoutId: id, amount });
      return this.view(await this.one(q, id));
    });
  }

  async markPaid(user: User, id: string, method: PayoutMethod) {
    return this.db.tx(async (q) => {
      const p = await this.one(q, id);
      if (p.status !== "accrued") throw new ApiError(409, "not_accrued", "Выплата уже закрыта");
      if (p.needs_amount) throw new ApiError(409, "needs_amount", "Сначала укажите сумму выплаты");
      await q.query(`UPDATE payouts SET status = 'paid', paid_at = now(), method = $2 WHERE id = $1`, [id, method]);
      return this.view(await this.one(q, id));
    });
  }

  async cancel(user: User, id: string) {
    return this.db.tx(async (q) => {
      const p = await this.one(q, id);
      if (p.status !== "accrued") throw new ApiError(409, "not_accrued", "Выплаченную запись отменить нельзя");
      await q.query(`UPDATE payouts SET status = 'cancelled' WHERE id = $1`, [id]);
      if (p.request_id) await logEvent(q, p.request_id, { userId: user.id, role: "owner" }, "payout_cancelled", { payoutId: id });
      return this.view(await this.one(q, id));
    });
  }

  /** Чек самозанятого к выплате: ссылка из «Мой налог» или фото. */
  async addReceipt(user: User, id: string, input: { url?: string; image?: { mime: string; data: Buffer } }) {
    return this.db.tx(async (q) => {
      const p = await this.one(q, id);
      if (p.master_id !== user.id) throw new ApiError(404, "not_found", "Выплата не найдена");
      if (p.status !== "paid") throw new ApiError(409, "not_paid", "Чек добавляется после выплаты");
      if (input.image)
        await this.files.save(q, { requestId: null, payoutId: id, uploadedBy: user.id, kind: "npd_receipt", mime: input.image.mime, data: input.image.data });
      else if (input.url) await q.query(`UPDATE payouts SET receipt_url = $1 WHERE id = $2`, [input.url, id]);
      else throw new ApiError(400, "receipt_required", "Добавьте ссылку на чек или фото");
      return this.view(await this.one(q, id));
    });
  }
}
