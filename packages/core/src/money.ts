/** Все суммы — целые копейки. */
export type Kopecks = number;

export type MasterRate =
  | { mode: "percent"; percent: number }
  | { mode: "fixed"; prices: Record<string, Kopecks> }; // id позиции прайса -> цена для мастера за единицу

export type WorkLine = { serviceId: string; qty: number; clientPrice: Kopecks };

/**
 * Выплата мастеру по заявке. Процент считается только от работ, без оборудования и материалов
 * (Приложение № 1 договора с мастером). Для фиксированного прайса null, если какой-то позиции
 * нет в прайсе мастера: такую сумму владелец согласует вручную.
 */
export function masterPay(rate: MasterRate, lines: readonly WorkLine[]): Kopecks | null {
  if (rate.mode === "percent") {
    const work = lines.reduce((s, l) => s + l.clientPrice * l.qty, 0);
    return Math.round((work * rate.percent) / 100);
  }
  let total = 0;
  for (const l of lines) {
    const price = rate.prices[l.serviceId];
    if (price === undefined) return null;
    total += price * l.qty;
  }
  return total;
}

/** Ставка УСН «доходы» в процентах. Налог берётся со всей выручки, включая оборудование и долю мастера. */
export const USN_RATE_PERCENT = 6;

export type RequestMoney = {
  work: Kopecks; // работы для клиента
  goods: Kopecks; // оборудование и материалы для клиента
  goodsCost: Kopecks; // закупочная стоимость оборудования и материалов
  masterPay: Kopecks;
};

export function requestProfit(m: RequestMoney, taxPercent = USN_RATE_PERCENT) {
  const revenue = m.work + m.goods;
  const tax = Math.round((revenue * taxPercent) / 100);
  return { revenue, tax, profit: revenue - m.goodsCost - m.masterPay - tax };
}

/** 1234567 -> «12 345,67 ₽» */
export function formatRub(k: Kopecks): string {
  const rub = Math.trunc(k / 100);
  const kop = Math.abs(k % 100);
  const s = Math.abs(rub).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${k < 0 ? "-" : ""}${s}${kop ? `,${String(kop).padStart(2, "0")}` : ""} ₽`;
}
