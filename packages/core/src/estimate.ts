import { lineTotal, type Kopecks } from "./money";

/** Смета и счета (docs/TZ.md, разделы 6.1 и 6.2). */

export const ITEM_KINDS = ["work", "material", "equipment"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  work: "Работа",
  material: "Материал",
  equipment: "Оборудование",
};

export const ESTIMATE_STATUSES = ["draft", "sent", "approved", "rejected", "superseded"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Черновик",
  sent: "Отправлена клиенту",
  approved: "Согласована",
  rejected: "Отклонена",
  superseded: "Заменена новой версией",
};

export const INVOICE_KINDS = ["materials", "works", "full", "other"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  materials: "Материалы и оборудование",
  works: "Работы",
  full: "Работы и материалы",
  other: "Прочее",
};

export const INVOICE_STATUSES = ["draft", "sent", "paid", "cancelled", "refunded"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Черновик",
  sent: "Ожидает оплаты",
  paid: "Оплачен",
  cancelled: "Отменён",
  refunded: "Возврат",
};

export type EstimateLine = { kind: ItemKind; qty: number; price: Kopecks; cost?: Kopecks | null; usedQty?: number | null };

export type EstimateTotals = {
  work: Kopecks;
  materials: Kopecks;
  equipment: Kopecks;
  goods: Kopecks; // материалы + оборудование
  total: Kopecks; // всё для клиента
  reserve: Kopecks; // резерв на непредвиденное — показывается отдельно, в счета не входит
  cost: Kopecks; // закупочная стоимость материалов и оборудования (по факту расхода, если он указан)
};

export function estimateTotals(lines: readonly EstimateLine[], reservePercent = 0): EstimateTotals {
  let work = 0;
  let materials = 0;
  let equipment = 0;
  let cost = 0;
  for (const l of lines) {
    const t = lineTotal(l.price, l.qty);
    if (l.kind === "work") work += t;
    else if (l.kind === "material") materials += t;
    else equipment += t;
    if (l.kind !== "work" && l.cost) cost += lineTotal(l.cost, l.usedQty ?? l.qty);
  }
  const total = work + materials + equipment;
  return { work, materials, equipment, goods: materials + equipment, total, reserve: Math.round((total * reservePercent) / 100), cost };
}

/** Сумма счёта по умолчанию из утверждённой сметы. null — сумму вводит владелец. */
export function defaultInvoiceAmount(kind: InvoiceKind, t: EstimateTotals): Kopecks | null {
  if (kind === "materials") return t.goods;
  if (kind === "works") return t.work;
  if (kind === "full") return t.total;
  return null;
}
