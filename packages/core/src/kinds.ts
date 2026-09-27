/** Справочники: откуда заявка, время визита, налоговый статус мастера, файлы, выплаты. */

export const REQUEST_SOURCES = ["site", "app", "call", "avito", "maps", "recommendation", "other"] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export const SOURCE_LABELS: Record<RequestSource, string> = {
  site: "Сайт",
  app: "Приложение",
  call: "Звонок",
  avito: "Авито",
  maps: "Карты",
  recommendation: "Рекомендация",
  other: "Другое",
};

/** Источники, которые владелец выбирает сам, когда заводит заявку. */
export const OWNER_SOURCES = ["call", "avito", "maps", "recommendation", "other"] as const;

export const SLOTS = ["", "morning", "day", "evening"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  "": "Любое время",
  morning: "Утро",
  day: "День",
  evening: "Вечер",
};

export const TAX_STATUSES = ["npd", "ip", "none"] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

export const TAX_STATUS_LABELS: Record<TaxStatus, string> = {
  npd: "Самозанятый",
  ip: "ИП",
  none: "Без статуса",
};

export const FILE_KINDS = ["client_photo", "before", "after", "extra_work", "act_paper", "npd_receipt", "receipt"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABELS: Record<FileKind, string> = {
  client_photo: "Фото клиента",
  before: "До работ",
  after: "После работ",
  extra_work: "Доп. работы",
  act_paper: "Бумажный акт",
  npd_receipt: "Чек самозанятого",
  receipt: "Чек покупки",
};

/** expense — возмещение того, что мастер купил для заявки на свои деньги (подтверждает владелец). */
export const PAYOUT_KINDS = ["work", "deduction", "bonus", "expense"] as const;
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

export const PAYOUT_KIND_LABELS: Record<PayoutKind, string> = {
  work: "За заявку",
  deduction: "Удержание",
  bonus: "Доплата",
  expense: "Возмещение покупок",
};

/**
 * Покупки по ходу работ (решение владельца 2026-09-27: мастер просит купить или покупает сам).
 * need — «нужно купить»: прораб покупает или разрешает мастеру; bought — мастер купил на свои, прораб подтверждает,
 * и сумма начисляется мастеру как возмещение.
 */
export const PURCHASE_KINDS = ["need", "bought"] as const;
export type PurchaseKind = (typeof PURCHASE_KINDS)[number];

export const PURCHASE_STATUSES = ["open", "done", "approved", "rejected"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  open: "Ждёт прораба",
  done: "Куплено",
  approved: "Возместим",
  rejected: "Не возмещаем",
};

export const PAYOUT_STATUSES = ["accrued", "paid", "cancelled"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  accrued: "Начислено",
  paid: "Выплачено",
  cancelled: "Отменено",
};

export const PAYOUT_METHODS = ["bank", "personal"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  bank: "Со счёта ИП",
  personal: "С личной карты",
};
