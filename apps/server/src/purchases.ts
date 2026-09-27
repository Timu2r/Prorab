import type { PurchaseKind, PurchaseStatus } from "@ks/core";
import { loadFor, mustBe } from "./access";
import type { User } from "./auth";
import type { Db, Queryable } from "./db";
import type { FileService } from "./files";
import { logEvent, type By } from "./flow";
import { ApiError, newId } from "./util";

/** Когда мастер сообщает о покупках: с «Принять» до закрытия заявки. */
const OPEN_FOR_PURCHASES = ["accepted", "en_route", "on_site", "done"];

type PurchaseRow = {
  id: string;
  request_id: string;
  master_id: string;
  master_name: string;
  kind: PurchaseKind;
  text: string;
  amount: string | number | null;
  file_id: string | null;
  status: PurchaseStatus;
  payout_id: string | null;
  created_at: Date;
  resolved_at: Date | null;
};

/** Покупки по заявке — владельцу и мастеру. Клиент их не видит: это расчёты компании с мастером. */
export async function loadPurchases(q: Queryable, files: FileService, requestId: string) {
  const rows = await q.query<PurchaseRow>(
    `SELECT p.*, u.name AS master_name FROM purchases p JOIN users u ON u.id = p.master_id WHERE p.request_id = $1 ORDER BY p.created_at`,
    [requestId],
  );
  return rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    text: p.text,
    amount: p.amount === null ? null : Number(p.amount),
    receiptUrl: p.file_id ? files.url(p.file_id) : null,
    status: p.status,
    master: { id: p.master_id, name: p.master_name },
    payoutId: p.payout_id,
    createdAt: p.created_at,
    resolvedAt: p.resolved_at,
  }));
}

/**
 * Покупки по ходу работ (решение владельца 2026-09-27, docs/TZ.md, 16.9): мастер просит купить или покупает сам.
 * Купленное на свои деньги прораб подтверждает — и сумма сразу начисляется мастеру как возмещение.
 */
export class PurchaseService {
  constructor(
    private db: Db,
    private files: FileService,
  ) {}

  async add(user: User, requestId: string, input: { kind: PurchaseKind; text: string; amount: number | null; fileId: string | null }) {
    return this.db.tx(async (q) => {
      const { r, as } = await loadFor(q, user, requestId);
      mustBe(as, "master");
      if (!OPEN_FOR_PURCHASES.includes(r.status)) throw new ApiError(409, "bad_transition", "О покупках сообщают во время работы");
      if (input.fileId) {
        const [f] = await q.query(`SELECT 1 FROM files WHERE id = $1 AND request_id = $2 AND uploaded_by = $3 AND kind = 'receipt' AND deleted_at IS NULL`, [
          input.fileId,
          requestId,
          user.id,
        ]);
        if (!f) throw new ApiError(400, "bad_file", "Фото чека не найдено");
      }
      const id = newId("pch");
      await q.query(`INSERT INTO purchases (id, request_id, master_id, kind, text, amount, file_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        id,
        requestId,
        user.id,
        input.kind,
        input.text.trim(),
        input.kind === "bought" ? input.amount : null,
        input.fileId,
      ]);
      await logEvent(q, requestId, { userId: user.id, role: "master" }, "purchase_added", { purchaseId: id, kind: input.kind, amount: input.amount });
      return loadPurchases(q, this.files, requestId);
    });
  }

  /**
   * Владелец: «нужно купить» — куплено (done) или не нужно (rejected); «купил сам» — возместить (approved, можно
   * поправить сумму) или нет (rejected). Возмещение сразу становится начислением мастеру.
   */
  async resolve(user: User, id: string, input: { status: "done" | "approved" | "rejected"; amount?: number }) {
    return this.db.tx(async (q) => {
      const [p] = await q.query<PurchaseRow>(`SELECT p.*, '' AS master_name FROM purchases p WHERE p.id = $1`, [id]);
      if (!p) throw new ApiError(404, "not_found", "Покупка не найдена");
      const { as } = await loadFor(q, user, p.request_id);
      mustBe(as, "owner");
      if (p.status !== "open") throw new ApiError(409, "resolved", "По этой покупке уже есть решение");
      const allowed = p.kind === "need" ? ["done", "rejected"] : ["approved", "rejected"];
      if (!allowed.includes(input.status)) throw new ApiError(400, "bad_status", "Такое решение для этой покупки не подходит");
      const by: By = { userId: user.id, role: "owner" };
      let payoutId: string | null = null;
      if (input.status === "approved") {
        const amount = input.amount ?? Number(p.amount);
        payoutId = newId("pay");
        await q.query(`INSERT INTO payouts (id, master_id, request_id, kind, amount, reason, created_by) VALUES ($1, $2, $3, 'expense', $4, $5, $6)`, [
          payoutId,
          p.master_id,
          p.request_id,
          amount,
          `Возмещение: ${p.text}`.slice(0, 500),
          user.id,
        ]);
      }
      await q.query(`UPDATE purchases SET status = $2, payout_id = $3, resolved_at = now(), resolved_by = $4 WHERE id = $1`, [id, input.status, payoutId, user.id]);
      await logEvent(q, p.request_id, by, "purchase_resolved", { purchaseId: id, status: input.status, payoutId });
      return loadPurchases(q, this.files, p.request_id);
    });
  }
}
