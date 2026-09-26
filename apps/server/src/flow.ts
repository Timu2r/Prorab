import type { RequestStatus } from "@ks/core";
import type { Queryable } from "./db";
import { newId } from "./util";

/** Кто совершил действие — для истории заявки. */
export type By = { userId: string | null; role: string };

const STAMP: Partial<Record<RequestStatus, string>> = {
  prepaid: "prepaid_at",
  done: "done_at",
  act_signed: "act_signed_at",
  paid: "paid_at",
  closed: "closed_at",
};

export async function logEvent(q: Queryable, requestId: string, by: By, kind: string, payload: object = {}): Promise<void> {
  await q.query(`INSERT INTO request_events (id, request_id, actor_id, actor_role, kind, payload) VALUES ($1, $2, $3, $4, $5, $6)`, [
    newId("evt"),
    requestId,
    by.userId,
    by.role,
    kind,
    JSON.stringify(payload),
  ]);
}

/** Меняет статус и ставит отметку времени шага. Проверки делает вызывающий код. */
export async function moveStatus(q: Queryable, requestId: string, from: RequestStatus, to: RequestStatus, by: By, extra: object = {}): Promise<void> {
  const col = STAMP[to];
  await q.query(`UPDATE requests SET status = $1, updated_at = now()${col ? `, ${col} = COALESCE(${col}, now())` : ""} WHERE id = $2`, [to, requestId]);
  await logEvent(q, requestId, by, "status", { from, to, ...extra });
}

/**
 * Автоматические шаги (docs/TZ.md, раздел 5):
 * смета утверждена → «Согласована»; отправлен счёт на материалы → «Счёт выставлен»;
 * оплачены все счета на материалы → «Предоплата получена»; акт подписан и все счета оплачены → «Оплачена».
 */
export async function syncStatus(q: Queryable, requestId: string, by: By): Promise<void> {
  for (let step = 0; step < 5; step++) {
    const [r] = await q.query<{ status: RequestStatus; prepaid_at: Date | null }>(`SELECT status, prepaid_at FROM requests WHERE id = $1`, [requestId]);
    const invoices = await q.query<{ kind: string; status: string }>(
      `SELECT kind, status FROM invoices WHERE request_id = $1 AND status IN ('sent', 'paid')`,
      [requestId],
    );
    const materials = invoices.filter((i) => i.kind === "materials");
    const materialsPaid = materials.length > 0 && materials.every((i) => i.status === "paid");
    // Предоплату отмечаем, даже если мастер уже назначен: от неё зависит, куда вернётся заявка при отказе мастера
    if (materialsPaid && !r.prepaid_at) await q.query(`UPDATE requests SET prepaid_at = now() WHERE id = $1`, [requestId]);

    let to: RequestStatus | null = null;
    if (r.status === "new") {
      const [approved] = await q.query(`SELECT 1 FROM estimates WHERE request_id = $1 AND status = 'approved'`, [requestId]);
      if (approved) to = "agreed";
    } else if (r.status === "agreed" && materials.length > 0) to = "invoiced";
    else if (r.status === "invoiced" && materialsPaid) to = "prepaid";
    else if (r.status === "act_signed" && invoices.some((i) => i.kind === "works" || i.kind === "full") && invoices.every((i) => i.status === "paid"))
      to = "paid";
    if (!to) return;
    await moveStatus(q, requestId, r.status, to, by, { auto: true });
  }
}
