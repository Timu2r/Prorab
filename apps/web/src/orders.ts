import type { RequestStatus } from "@ks/core";

/** Этапы заказа простыми словами — так их видит клиент в «Мои заказы» (docs/TZ.md, 16.4). */
export const STAGES = ["Заявка", "Смета и договор", "Мастер", "Работы", "Приёмка", "Оплата"] as const;

/**
 * Номер текущего этапа; STAGES.length — все пройдены. Заявка принята сразу, дальше прораб звонит и готовит смету —
 * поэтому новая заявка уже на этапе «Смета и договор». Отменённую заявку показываем отдельно.
 */
export function stageOf(status: RequestStatus): number {
  switch (status) {
    case "new":
      return 1;
    case "agreed":
    case "invoiced":
    case "prepaid":
    case "assigned":
      return 2;
    case "accepted":
    case "en_route":
    case "on_site":
      return 3;
    case "done":
      return 4;
    case "act_signed":
      return 5;
    case "paid":
    case "closed":
      return STAGES.length;
    default:
      return 0;
  }
}

/** Где заказ сейчас — одной строкой для списка. Статусы владельца («Счёт выставлен», «Назначена») клиенту не показываем. */
export const STAGE_LABELS: Record<RequestStatus, string> = {
  new: "Заявка принята",
  agreed: "Смета согласована",
  invoiced: "Счёт на материалы",
  prepaid: "Материалы оплачены",
  assigned: "Подбираем мастера",
  accepted: "Мастер подтвердил",
  en_route: "Мастер едет",
  on_site: "Мастер на месте",
  done: "Работы выполнены",
  act_signed: "Работа принята",
  paid: "Оплачен",
  closed: "Завершён",
  cancelled: "Отменён",
};

/** Что делает мастер — для блока «Кто работает». */
export const MASTER_STATE_LABELS = {
  accepted: "Подтвердил заказ",
  en_route: "Едет к вам",
  on_site: "На месте",
  done: "Закончил",
} as const;

export type MasterState = keyof typeof MASTER_STATE_LABELS;

const MSK = 3 * 3_600_000;
const two = (n: number) => String(n).padStart(2, "0");

/** Окно визита по Москве: «30.09, 09:00–12:00». */
export function visitText(at: string, until: string | null): string {
  const f = (v: string) => new Date(new Date(v).getTime() + MSK);
  const a = f(at);
  const t = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  return `${two(a.getUTCDate())}.${two(a.getUTCMonth() + 1)}, ${t(a)}${until ? `–${t(f(until))}` : ""}`;
}

/** Дата по Москве: «27.09.2026». Строка вида 2026-09-27 — уже дата, без пересчёта. */
export function dateText(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join(".");
  const d = new Date(new Date(v).getTime() + MSK);
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}
