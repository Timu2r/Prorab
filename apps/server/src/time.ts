/** Москва — UTC+3 круглый год (перехода на летнее время нет с 2014 года), поэтому считаем без базы часовых поясов. */
const MSK = 3 * 3_600_000;
const DAY = 86_400_000;

/** Начало суток по Москве. */
export function moscowDayStart(d = new Date()): Date {
  return new Date(Math.floor((d.getTime() + MSK) / DAY) * DAY - MSK);
}

/** Дата по Москве: YYYY-MM-DD. */
export function moscowDate(d: Date = new Date()): string {
  return new Date(d.getTime() + MSK).toISOString().slice(0, 10);
}

/** Границы месяца по Москве. Без аргумента — текущий месяц. */
export function moscowMonth(month?: string): { month: string; start: Date; end: Date } {
  let y: number;
  let m: number;
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) [y, m] = month.split("-").map(Number) as [number, number];
  else {
    const now = new Date(Date.now() + MSK);
    y = now.getUTCFullYear();
    m = now.getUTCMonth() + 1;
  }
  return {
    month: `${y}-${String(m).padStart(2, "0")}`,
    start: new Date(Date.UTC(y, m - 1, 1) - MSK),
    end: new Date(Date.UTC(y, m, 1) - MSK),
  };
}

/** YYYY-MM-DD + N месяцев. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}
