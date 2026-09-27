import { defaultInvoiceAmount, formatRequestNumber, type InvoiceKind, type InvoiceStatus } from "@ks/core";
import { isFinal, loadFor, mustBe } from "./access";
import type { User } from "./auth";
import type { Db, Queryable } from "./db";
import { approvedEstimate } from "./estimates";
import { logEvent, syncStatus } from "./flow";
import { ApiError, newId } from "./util";

type InvoiceRow = {
  id: string;
  request_id: string;
  number: string;
  kind: InvoiceKind;
  amount: string | number;
  payment_url: string;
  status: InvoiceStatus;
  created_at: Date;
  sent_at: Date | null;
  paid_at: Date | null;
  bank_ref: string;
};

const view = (i: InvoiceRow) => ({
  id: i.id,
  number: i.number,
  kind: i.kind,
  amount: Number(i.amount),
  paymentUrl: i.payment_url,
  status: i.status,
  createdAt: i.created_at,
  sentAt: i.sent_at,
  paidAt: i.paid_at,
  bankRef: i.bank_ref,
});

export type InvoiceView = ReturnType<typeof view>;

export async function loadInvoices(q: Queryable, requestId: string): Promise<InvoiceView[]> {
  return (await q.query<InvoiceRow>(`SELECT * FROM invoices WHERE request_id = $1 ORDER BY created_at`, [requestId])).map(view);
}

/** Клиент видит только отправленные счета: к оплате, оплаченные, возвраты. */
export function clientInvoices(list: InvoiceView[]) {
  return list.filter((i) => i.status === "sent" || i.status === "paid" || i.status === "refunded").map(({ bankRef: _b, ...i }) => i);
}

/**
 * Счета (docs/TZ.md, 6.2). В версии 1.0 ссылку на оплату владелец создаёт в Т-Бизнесе или Альфе, чек формирует банк,
 * а оплату владелец отмечает сам.
 */
export class InvoiceService {
  constructor(private db: Db) {}

  async create(user: User, requestId: string, input: { kind: InvoiceKind; amount?: number | null; paymentUrl?: string }) {
    return this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, requestId);
      mustBe(as, "owner");
      if (isFinal(r)) throw new ApiError(409, "final", "Заявка уже закрыта");
      if (r.status === "new") throw new ApiError(409, "estimate_required", "Сначала согласуйте смету");
      let amount = input.amount ?? null;
      if (amount === null) {
        const est = await approvedEstimate(q, requestId);
        amount = est ? defaultInvoiceAmount(input.kind, est.totals) : null;
      }
      if (!amount || amount <= 0) throw new ApiError(400, "amount_required", "Укажите сумму счёта");
      const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE request_id = $1`, [requestId]);
      const id = newId("inv");
      await q.query(`INSERT INTO invoices (id, request_id, number, kind, amount, payment_url, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        id,
        requestId,
        `${formatRequestNumber(r.number)}-${n + 1}`,
        input.kind,
        amount,
        input.paymentUrl ?? "",
        user.id,
      ]);
      await logEvent(q, requestId, { userId: user.id, role: "owner" }, "invoice_created", { invoiceId: id, kind: input.kind, amount });
      return this.one(q, id);
    });
  }

  private async one(q: Queryable, id: string): Promise<InvoiceView> {
    const [i] = await q.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (!i) throw new ApiError(404, "not_found", "Счёт не найден");
    return view(i);
  }

  private async ownerInvoice(q: Queryable, user: User, id: string) {
    const [i] = await q.query<InvoiceRow>(`SELECT * FROM invoices WHERE id = $1`, [id]);
    if (!i) throw new ApiError(404, "not_found", "Счёт не найден");
    const { as } = await loadFor(q, user, i.request_id);
    mustBe(as, "owner");
    return i;
  }

  async update(user: User, id: string, patch: { amount?: number; paymentUrl?: string }) {
    return this.db.tx(async (q) => {
      const i = await this.ownerInvoice(q, user, id);
      if (i.status !== "draft") throw new ApiError(409, "not_draft", "Отправленный счёт менять нельзя: отмените его и выставьте новый");
      await q.query(`UPDATE invoices SET amount = COALESCE($1, amount), payment_url = COALESCE($2, payment_url) WHERE id = $3`, [
        patch.amount ?? null,
        patch.paymentUrl ?? null,
        id,
      ]);
      return this.one(q, id);
    });
  }

  async send(user: User, id: string) {
    return this.db.tx(async (q) => {
      const i = await this.ownerInvoice(q, user, id);
      if (i.status !== "draft") throw new ApiError(409, "not_draft", "Счёт уже отправлен");
      await q.query(`UPDATE invoices SET status = 'sent', sent_at = now() WHERE id = $1`, [id]);
      const by = { userId: user.id, role: "owner" };
      await logEvent(q, i.request_id, by, "invoice_sent", { invoiceId: id, amount: Number(i.amount) });
      await syncStatus(q, i.request_id, by);
      return this.one(q, id);
    });
  }

  async markPaid(user: User, id: string, bankRef: string) {
    return this.db.tx(async (q) => {
      const i = await this.ownerInvoice(q, user, id);
      if (i.status !== "sent") throw new ApiError(409, "not_sent", "Оплату можно отметить только у отправленного счёта");
      await q.query(`UPDATE invoices SET status = 'paid', paid_at = now(), confirmed_by = $2, bank_ref = $3 WHERE id = $1`, [id, user.id, bankRef]);
      const by = { userId: user.id, role: "owner" };
      await logEvent(q, i.request_id, by, "invoice_paid", { invoiceId: id, amount: Number(i.amount) });
      await syncStatus(q, i.request_id, by);
      return this.one(q, id);
    });
  }

  /** Неоплаченный счёт отменяется; оплаченный — отмечается как возврат денег клиенту. */
  async cancel(user: User, id: string) {
    return this.db.tx(async (q) => {
      const i = await this.ownerInvoice(q, user, id);
      const by = { userId: user.id, role: "owner" };
      if (i.status === "draft" || i.status === "sent") {
        await q.query(`UPDATE invoices SET status = 'cancelled' WHERE id = $1`, [id]);
        await logEvent(q, i.request_id, by, "invoice_cancelled", { invoiceId: id });
      } else if (i.status === "paid") {
        await q.query(`UPDATE invoices SET status = 'refunded' WHERE id = $1`, [id]);
        await logEvent(q, i.request_id, by, "invoice_refunded", { invoiceId: id, amount: Number(i.amount) });
        const [{ n }] = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE request_id = $1 AND status = 'paid'`, [i.request_id]);
        if (!n) await q.query(`UPDATE requests SET refund_required = false WHERE id = $1`, [i.request_id]);
      } else throw new ApiError(409, "final", "Счёт уже отменён");
      await syncStatus(q, i.request_id, by);
      return this.one(q, id);
    });
  }
}
