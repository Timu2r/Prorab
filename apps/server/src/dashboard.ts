import { formatRequestNumber, requestResult, type RequestStatus } from "@ks/core";
import type { Db } from "./db";
import type { SettingsService } from "./settings";
import { moscowDayStart, moscowMonth } from "./time";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type Attention = { kind: string; text: string; requestId: string | null; number: string | null; payoutId: string | null; since: Date };

/** Сводка владельца и отчёты (docs/TZ.md, 9.2 и 8.7). */
export class DashboardService {
  constructor(
    private db: Db,
    private settings: SettingsService,
  ) {}

  async dashboard() {
    const s = await this.settings.get();
    return { attention: await this.attention(s.attention), today: await this.today(), month: await this.month(undefined, s.taxPercent) };
  }

  /** «Требует внимания»: что зависло дольше порога из настроек. */
  private async attention(a: Awaited<ReturnType<SettingsService["get"]>>["attention"]): Promise<Attention[]> {
    const now = Date.now();
    const before = (ms: number) => new Date(now - ms);
    const out: Attention[] = [];
    const push = (kind: string, text: string, r: { id?: string; number?: number; payout_id?: string; since: Date }) =>
      out.push({
        kind,
        text,
        requestId: r.id ?? null,
        number: r.number === undefined ? null : formatRequestNumber(r.number),
        payoutId: r.payout_id ?? null,
        since: r.since,
      });
    const q = <T>(sql: string, params: unknown[] = []) => this.db.query<T & { id: string; number: number; since: Date }>(sql, params);

    for (const r of await q(`SELECT id, number, created_at AS since FROM requests WHERE status = 'new' AND deleted_at IS NULL AND created_at < $1`, [
      before(a.newMinutes * MIN),
    ]))
      push("new_waiting", "Новая заявка ждёт ответа", r);

    for (const r of await q(
      `SELECT r.id, r.number, (SELECT max(e.at) FROM request_events e WHERE e.request_id = r.id AND e.kind IN ('assigned', 'reassigned', 'declined')) AS since
       FROM requests r WHERE r.status = 'assigned' AND r.deleted_at IS NULL`,
    ))
      if (r.since && new Date(r.since).getTime() < now - a.noAnswerMinutes * MIN) push("no_answer", "Мастер не ответил на задание", r);

    for (const r of await q(
      `SELECT r.id, r.number, e.sent_at AS since FROM estimates e JOIN requests r ON r.id = e.request_id
       WHERE e.status = 'sent' AND e.sent_at < $1 AND r.status NOT IN ('closed', 'cancelled')`,
      [before(a.estimateHours * HOUR)],
    ))
      push("estimate_waiting", "Клиент не ответил на смету", r);

    for (const r of await q(
      `SELECT r.id, r.number, i.sent_at AS since FROM invoices i JOIN requests r ON r.id = i.request_id WHERE i.status = 'sent' AND i.sent_at < $1`,
      [before(a.invoiceDays * DAY)],
    ))
      push("invoice_unpaid", "Счёт не оплачен", r);

    for (const r of await q(`SELECT id, number, done_at AS since FROM requests WHERE status = 'done' AND done_at < $1`, [before(a.actDays * DAY)]))
      push("act_waiting", "Работа выполнена, акт не подписан", r);

    for (const r of await q(`SELECT id, number, updated_at AS since FROM requests WHERE refund_required AND deleted_at IS NULL`))
      push("refund_required", "Нужен возврат денег клиенту", r);

    // Покупки мастера ждут прораба сразу, без порога: мастер стоит на объекте
    for (const r of await q<{ kind: string; text: string }>(
      `SELECT r.id, r.number, p.created_at AS since, p.kind, p.text FROM purchases p JOIN requests r ON r.id = p.request_id WHERE p.status = 'open'`,
    ))
      push(
        r.kind === "need" ? "purchase_need" : "purchase_bought",
        r.kind === "need" ? `Мастер просит купить: ${r.text}` : `Мастер купил сам: ${r.text} — подтвердите возмещение`,
        r,
      );

    const payouts = await this.db.query<{ payout_id: string; id: string | null; number: number | null; since: Date; needs_amount: boolean; status: string }>(
      `SELECT p.id AS payout_id, r.id, r.number, p.accrued_at AS since, p.needs_amount, p.status
       FROM payouts p LEFT JOIN requests r ON r.id = p.request_id WHERE p.status = 'accrued'`,
    );
    for (const p of payouts) {
      const r = { payout_id: p.payout_id, id: p.id ?? undefined, number: p.number ?? undefined, since: p.since };
      if (p.needs_amount) push("payout_amount", "Нужно указать сумму выплаты мастеру", r);
      else if (new Date(p.since).getTime() < now - a.payoutDays * DAY) push("payout_overdue", "Выплата мастеру задерживается", r);
    }

    for (const p of await this.db.query<{ payout_id: string; id: string | null; number: number | null; since: Date }>(
      `SELECT p.id AS payout_id, r.id, r.number, p.paid_at AS since FROM payouts p JOIN masters m ON m.user_id = p.master_id LEFT JOIN requests r ON r.id = p.request_id
       WHERE p.status = 'paid' AND m.tax_status = 'npd' AND p.receipt_url = '' AND p.paid_at < $1
         AND NOT EXISTS (SELECT 1 FROM files f WHERE f.payout_id = p.id AND f.deleted_at IS NULL)`,
      [before(a.receiptDays * DAY)],
    ))
      push("receipt_missing", "Самозанятый не прислал чек", { payout_id: p.payout_id, id: p.id ?? undefined, number: p.number ?? undefined, since: p.since });

    return out.sort((x, y) => new Date(x.since).getTime() - new Date(y.since).getTime());
  }

  /** Сегодня по Москве: визиты мастеров и выезды прораба на объект (docs/TZ.md, 16.9), по времени. */
  private async today() {
    const start = moscowDayStart();
    const end = new Date(start.getTime() + DAY);
    type Row = { id: string; number: number; status: RequestStatus; category: string; district: string; at: Date; until: Date | null; who: string | null };
    const visits = await this.db.query<Row>(
      `SELECT r.id, r.number, r.status, r.category, r.district, r.visit_at AS at, r.visit_until AS until, m.name AS who
       FROM requests r LEFT JOIN users m ON m.id = r.master_id
       WHERE r.visit_at >= $1 AND r.visit_at < $2 AND r.status <> 'cancelled' AND r.deleted_at IS NULL`,
      [start, end],
    );
    const surveys = await this.db.query<Row>(
      `SELECT r.id, r.number, r.status, r.category, r.district, r.survey_at AS at, r.survey_until AS until, f.name AS who
       FROM requests r LEFT JOIN users f ON f.id = r.foreman_id
       WHERE r.survey_at >= $1 AND r.survey_at < $2 AND r.status NOT IN ('cancelled', 'closed') AND r.deleted_at IS NULL`,
      [start, end],
    );
    const item = (kind: "visit" | "survey") => (r: Row) => ({
      kind,
      id: r.id,
      number: formatRequestNumber(r.number),
      status: r.status,
      category: r.category,
      district: r.district,
      visitAt: r.at,
      visitUntil: r.until,
      /** Визит — мастер; выезд — прораб заказа. */
      master: r.who,
    });
    return [...visits.map(item("visit")), ...surveys.map(item("survey"))].sort((a, b) => new Date(a.visitAt).getTime() - new Date(b.visitAt).getTime());
  }

  /** Итоги месяца: поток денег и результат по закрытым заявкам. */
  async month(month?: string, taxPercent?: number) {
    const m = moscowMonth(month);
    const tax = taxPercent ?? (await this.settings.get()).taxPercent;
    const [counts] = await this.db.query<{ created: number; closed: number; cash_in: string; payouts_paid: string }>(
      `SELECT
         (SELECT count(*)::int FROM requests WHERE created_at >= $1 AND created_at < $2 AND deleted_at IS NULL) AS created,
         (SELECT count(*)::int FROM requests WHERE closed_at >= $1 AND closed_at < $2 AND deleted_at IS NULL) AS closed,
         (SELECT COALESCE(sum(amount), 0) FROM invoices WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2) AS cash_in,
         (SELECT COALESCE(sum(amount), 0) FROM payouts WHERE status = 'paid' AND paid_at >= $1 AND paid_at < $2) AS payouts_paid`,
      [m.start, m.end],
    );
    const report = await this.money(month, tax);
    return {
      month: m.month,
      newRequests: counts.created,
      closed: counts.closed,
      cashIn: Number(counts.cash_in),
      payoutsPaid: Number(counts.payouts_paid),
      result: report.total,
    };
  }

  /** Деньги по закрытым за месяц заявкам — по направлениям. */
  async money(month?: string, taxPercent?: number) {
    const m = moscowMonth(month);
    const tax = taxPercent ?? (await this.settings.get()).taxPercent;
    const rows = await this.db.query<{ category: string; revenue: string; goods_cost: string; payouts: string }>(
      `SELECT r.category,
         (SELECT COALESCE(sum(i.amount), 0) FROM invoices i WHERE i.request_id = r.id AND i.status = 'paid') AS revenue,
         (SELECT COALESCE(sum(round(it.cost * COALESCE(it.used_qty, it.qty))), 0) FROM estimate_items it JOIN estimates e ON e.id = it.estimate_id
            WHERE e.request_id = r.id AND e.status = 'approved' AND it.kind <> 'work' AND it.cost IS NOT NULL) AS goods_cost,
         (SELECT COALESCE(sum(p.amount), 0) FROM payouts p WHERE p.request_id = r.id AND p.status <> 'cancelled') AS payouts
       FROM requests r WHERE r.closed_at >= $1 AND r.closed_at < $2 AND r.deleted_at IS NULL`,
      [m.start, m.end],
    );
    const byCategory = new Map<string, { count: number; revenue: number; goodsCost: number; payouts: number }>();
    for (const r of rows) {
      const c = byCategory.get(r.category) ?? { count: 0, revenue: 0, goodsCost: 0, payouts: 0 };
      c.count++;
      c.revenue += Number(r.revenue);
      c.goodsCost += Number(r.goods_cost);
      c.payouts += Number(r.payouts);
      byCategory.set(r.category, c);
    }
    const categories = [...byCategory].map(([category, c]) => ({ category, count: c.count, ...requestResult(c, tax) }));
    const sum = (k: "revenue" | "goodsCost" | "payouts") => categories.reduce((s, c) => s + c[k], 0);
    return {
      month: m.month,
      categories,
      total: { count: rows.length, ...requestResult({ revenue: sum("revenue"), goodsCost: sum("goodsCost"), payouts: sum("payouts") }, tax) },
    };
  }

  /** Откуда заявки и сколько доходит до согласования и закрытия. По умолчанию — последние 30 дней. */
  async funnel(from?: string, to?: string) {
    const end = to ? new Date(`${to}T00:00:00+03:00`).getTime() + DAY : Date.now();
    const start = from ? new Date(`${from}T00:00:00+03:00`).getTime() : end - 30 * DAY;
    const rows = await this.db.query<{ source: string; created: number; agreed: number; closed: number; cancelled: number }>(
      `SELECT r.source, count(*)::int AS created,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM estimates e WHERE e.request_id = r.id AND e.status IN ('approved', 'superseded')))::int AS agreed,
         count(*) FILTER (WHERE r.status = 'closed')::int AS closed,
         count(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled
       FROM requests r WHERE r.created_at >= $1 AND r.created_at < $2 AND r.deleted_at IS NULL GROUP BY r.source ORDER BY created DESC`,
      [new Date(start), new Date(end)],
    );
    return { from: new Date(start), to: new Date(end), sources: rows };
  }
}
