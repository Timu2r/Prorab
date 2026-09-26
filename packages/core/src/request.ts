import type { Role } from "./roles";

/** Статусы заявки по порядку жизненного цикла (docs/TZ.md, раздел 3). */
export const REQUEST_STATUSES = [
  "new",
  "agreed",
  "invoiced",
  "prepaid",
  "assigned",
  "accepted",
  "en_route",
  "on_site",
  "done",
  "act_signed",
  "paid",
  "closed",
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: "Новая",
  agreed: "Согласована",
  invoiced: "Счёт выставлен",
  prepaid: "Предоплата получена",
  assigned: "Назначена мастеру",
  accepted: "Принята мастером",
  en_route: "Мастер выехал",
  on_site: "Мастер на месте",
  done: "Работы выполнены",
  act_signed: "Акт подписан",
  paid: "Оплачена",
  closed: "Закрыта",
  cancelled: "Отменена",
};

type Rule = { from: RequestStatus; to: RequestStatus; by: readonly Role[] };

/**
 * Разрешённые переходы и кто их делает. Всё, чего нет в таблице, запрещено.
 * Назначение мастера (-> assigned) и отказ мастера (assigned -> назад) идут отдельными действиями,
 * потому что меняют не только статус: см. assignTargets() и unassignTarget().
 */
const RULES: readonly Rule[] = [
  { from: "new", to: "agreed", by: ["owner"] },
  { from: "agreed", to: "invoiced", by: ["owner"] },
  { from: "invoiced", to: "prepaid", by: ["owner"] },
  { from: "assigned", to: "accepted", by: ["master"] },
  { from: "accepted", to: "en_route", by: ["master"] },
  { from: "en_route", to: "on_site", by: ["master"] },
  { from: "on_site", to: "done", by: ["master"] },
  // Клиент подписывает акт сам; владелец ставит статус, если мастер привёз фото бумажного акта.
  { from: "done", to: "act_signed", by: ["client", "owner"] },
  { from: "act_signed", to: "paid", by: ["owner"] },
  { from: "paid", to: "closed", by: ["owner"] },
];

/** До выезда мастера заявку может отменить и клиент; после выезда — только владелец. */
const CLIENT_CANCELLABLE: readonly RequestStatus[] = ["new", "agreed", "invoiced", "prepaid", "assigned", "accepted"];
const OWNER_CANCELLABLE: readonly RequestStatus[] = [...CLIENT_CANCELLABLE, "en_route", "on_site"];

export function canTransition(from: RequestStatus, to: RequestStatus, actor: Role): boolean {
  if (to === "cancelled") return canCancel(from, actor);
  return RULES.some((r) => r.from === from && r.to === to && r.by.includes(actor));
}

export function canCancel(from: RequestStatus, actor: Role): boolean {
  if (actor === "client") return CLIENT_CANCELLABLE.includes(from);
  if (actor === "owner") return OWNER_CANCELLABLE.includes(from);
  return false;
}

/** Куда может перейти заявка из текущего статуса силами этой роли (для кнопок в интерфейсе). */
export function nextStatuses(from: RequestStatus, actor: Role): RequestStatus[] {
  const next = RULES.filter((r) => r.from === from && r.by.includes(actor)).map((r) => r.to);
  if (canCancel(from, actor)) next.push("cancelled");
  return next;
}

/** Из каких статусов владелец может назначить мастера: работа без материалов идёт сразу после согласования. */
export const ASSIGNABLE_FROM: readonly RequestStatus[] = ["agreed", "prepaid"];

export function canAssign(from: RequestStatus): boolean {
  return ASSIGNABLE_FROM.includes(from);
}

/**
 * Куда возвращается заявка, когда мастер отказался (из «Назначена») или владелец снял мастера (до выезда).
 * Если предоплата уже была, заявка возвращается в «Предоплата получена», иначе в «Согласована».
 */
export function unassignTarget(prepaid: boolean): RequestStatus {
  return prepaid ? "prepaid" : "agreed";
}

export function canUnassign(from: RequestStatus, actor: Role): boolean {
  if (actor === "master") return from === "assigned";
  if (actor === "owner") return from === "assigned" || from === "accepted";
  return false;
}

/**
 * Видит ли мастер телефон и точный адрес клиента. До принятия задания — нет:
 * мастер может отказаться, и тогда контакты клиента у него остаться не должны.
 */
export function masterSeesContacts(status: RequestStatus): boolean {
  const i = REQUEST_STATUSES.indexOf(status);
  return status !== "cancelled" && i >= REQUEST_STATUSES.indexOf("accepted") && i <= REQUEST_STATUSES.indexOf("closed");
}

export function isFinal(status: RequestStatus): boolean {
  return status === "closed" || status === "cancelled";
}

/** Номер заявки для разговора по телефону: 12 -> Z-0012. */
export function formatRequestNumber(n: number): string {
  return `Z-${String(n).padStart(4, "0")}`;
}
