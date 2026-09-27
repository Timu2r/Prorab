/** Время показываем по Москве (UTC+3 круглый год) — одинаково на телефоне и в браузере, без таблиц часовых поясов. */
const MSK = 3 * 3_600_000;
const two = (n: number) => String(n).padStart(2, "0");
const msk = (v: string | Date) => new Date(new Date(v).getTime() + MSK);

export function formatDate(v: string | Date): string {
  const d = msk(v);
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export function formatDayMonth(v: string | Date): string {
  const d = msk(v);
  return `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}`;
}

export function formatTime(v: string | Date): string {
  const d = msk(v);
  return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/**
 * «27.09, 10:00–12:00»; работы на несколько дней — «03.10–05.10, 09:00–18:00» (docs/TZ.md, 16.6).
 * null — визит не назначен.
 */
export function formatVisit(at: string | null, until: string | null): string | null {
  if (!at) return null;
  if (until && formatDate(until) !== formatDate(at)) return `${formatDayMonth(at)}–${formatDayMonth(until)}, ${formatTime(at)}–${formatTime(until)}`;
  return `${formatDayMonth(at)}, ${formatTime(at)}${until ? `–${formatTime(until)}` : ""}`;
}

export function isToday(v: string | null): boolean {
  return !!v && formatDate(v) === formatDate(new Date());
}

/** «5 мин назад», «3 ч назад», «2 дн назад». */
export function ago(v: string | Date): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60_000));
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ч назад`;
  return `${Math.round(h / 24)} дн назад`;
}

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «Пятница, 26 сентября» — сегодня по Москве. */
export function formatToday(now = new Date()): string {
  const d = msk(now);
  const day = WEEKDAYS[d.getUTCDay()]!;
  return `${day[0]!.toUpperCase()}${day.slice(1)}, ${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`;
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

/** «2026-09» -> «Сентябрь». */
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/** +7 (999) 123-45-67 по мере ввода. Сервер сам приводит номер к виду +79991234567. */
export function formatPhoneInput(v: string): string {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("8") || d.startsWith("7")) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return "";
  let out = "+7 (" + d.slice(0, 3);
  if (d.length >= 3) out += ")";
  if (d.length > 3) out += " " + d.slice(3, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  if (d.length > 8) out += "-" + d.slice(8, 10);
  return out;
}
