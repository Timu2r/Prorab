import { CATEGORIES, formatRequestNumber, type Category, type RequestStatus } from "@ks/core";
import type { Db } from "./db";
import { ApiError } from "./util";

/**
 * Календарь занятости (docs/TZ.md, 16.6): кто из мастеров в какие окна занят и сколько мастеров каждого направления
 * свободно по дням — чтобы видеть «на сегодня кондиционерщиков нет, ближайшее — 30.09» раньше, чем что-то обещать.
 */

/** Окна дня по Москве — те же, что при записи визита: 9–12, 12–15, 15–18, 18–21. */
export const WINDOW_STARTS = [9, 12, 15, 18] as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MSK = 3 * HOUR;
/** Визит занимает мастеров, пока работа не выполнена. */
const BUSY_STATUSES: RequestStatus[] = ["assigned", "accepted", "en_route", "on_site"];
const DIRECTIONS = CATEGORIES.filter((c) => c !== "general");
const MAX_DAYS = 31;

/** Полночь по Москве для даты ГГГГ-ММ-ДД — в мс UTC. */
export const mskMidnight = (date: string) => Date.parse(`${date}T00:00:00Z`) - MSK;
/** Дата по Москве для момента в мс UTC. */
export const mskDate = (ms: number) => new Date(ms + MSK).toISOString().slice(0, 10);

/** Какие окна дня пересекает интервал [from, to). */
export function busyWindows(day: string, from: number, to: number): boolean[] {
  const base = mskMidnight(day);
  return WINDOW_STARTS.map((h) => from < base + (h + 3) * HOUR && to > base + h * HOUR);
}

type Job = { request_id: string; master_id: string; at: Date; until: Date | null; day_from: string | null; day_to: string | null };

/** Интервал визита: без конца — одно окно, 3 часа. */
const span = (j: { at: Date; until: Date | null }) => {
  const from = new Date(j.at).getTime();
  return { from, to: j.until ? new Date(j.until).getTime() : from + 3 * HOUR };
};

export class CalendarService {
  constructor(private db: Db) {}

  /** Занятость на days дней с даты from: мастера по окнам и сводка по направлениям. */
  async week(from: string, days: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !Number.isFinite(mskMidnight(from))) throw new ApiError(400, "bad_date", "Дата в формате ГГГГ-ММ-ДД");
    const n = Math.min(Math.max(Math.trunc(days) || 7, 1), MAX_DAYS);
    const start = mskMidnight(from);
    const end = start + n * DAY;
    const dates = Array.from({ length: n }, (_, i) => mskDate(start + i * DAY));

    const masters = await this.db.query<{ id: string; name: string; skills: Category[]; available: boolean; is_lead: boolean }>(
      `SELECT u.id, u.name, m.skills, m.available, m.is_lead FROM masters m JOIN users u ON u.id = m.user_id WHERE m.active ORDER BY u.name`,
    );
    const jobs = await this.db.query<Job>(
      `SELECT r.id AS request_id, r.master_id, r.visit_at AS at, r.visit_until AS until, NULL AS day_from, NULL AS day_to
       FROM requests r
       WHERE r.master_id IS NOT NULL AND r.status = ANY($3::text[]) AND r.deleted_at IS NULL AND r.visit_at IS NOT NULL
         AND r.visit_at < $2 AND COALESCE(r.visit_until, r.visit_at + interval '3 hours') > $1
       UNION ALL
       SELECT r.id, c.master_id, r.visit_at, r.visit_until, to_char(c.day_from, 'YYYY-MM-DD'), to_char(c.day_to, 'YYYY-MM-DD')
       FROM request_crew c JOIN requests r ON r.id = c.request_id
       WHERE r.status = ANY($3::text[]) AND r.deleted_at IS NULL AND r.visit_at IS NOT NULL
         AND r.visit_at < $2 AND COALESCE(r.visit_until, r.visit_at + interval '3 hours') > $1`,
      [new Date(start), new Date(end), BUSY_STATUSES],
    );

    const busy = new Map<string, boolean[][]>(masters.map((m) => [m.id, dates.map(() => WINDOW_STARTS.map(() => false))]));
    for (const j of jobs) {
      const grid = busy.get(j.master_id);
      if (!grid) continue;
      const { from: a, to: b } = span(j);
      // Работы на несколько дней (ремонт, полы, фасад) занимают мастера целиком: вечернее окно после такого дня
      // не свободно для нового заказа
      const first = mskDate(a);
      const last = mskDate(b - 1);
      dates.forEach((d, i) => {
        // Помощник со своими днями занят только в эти дни
        if ((j.day_from && d < j.day_from) || (j.day_to && d > j.day_to)) return;
        const windows = first !== last ? (d >= first && d <= last ? WINDOW_STARTS.map(() => true) : []) : busyWindows(d, a, b);
        windows.forEach((x, w) => {
          if (x) grid[i]![w] = true;
        });
      });
    }

    const view = masters.map((m) => ({ id: m.id, name: m.name, skills: m.skills, available: m.available, isLead: m.is_lead, days: busy.get(m.id)! }));
    const directions = DIRECTIONS.map((category) => {
      const own = view.filter((m) => m.skills.includes(category));
      return {
        category,
        total: own.length,
        // Свободен — принимает заказы и в этот день у него есть хотя бы одно свободное окно
        free: dates.map((_, i) => own.filter((m) => m.available && m.days[i]!.some((w) => !w)).length),
      };
    }).filter((d) => d.total > 0);

    return { from: dates[0]!, days: dates, windows: WINDOW_STARTS.map((h) => ({ from: h, to: h + 3 })), masters: view, directions };
  }

  /** План дня: визиты мастеров и выезды прораба по времени, с бригадой и ценой; ниже — заявки без времени визита. */
  async day(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "bad_date", "Дата в формате ГГГГ-ММ-ДД");
    const start = new Date(mskMidnight(date));
    const end = new Date(mskMidnight(date) + DAY);
    type Row = {
      id: string;
      number: number;
      status: RequestStatus;
      category: Category;
      district: string;
      address: string;
      at: Date;
      until: Date | null;
      client_name: string;
      client_phone: string;
      master_name: string | null;
      foreman_name: string | null;
      price: string | null;
    };
    const cols = `r.id, r.number, r.status, r.category, r.district, r.address, c.name AS client_name, c.phone AS client_phone,
                  m.name AS master_name, f.name AS foreman_name,
                  CASE WHEN r.price_work IS NULL THEN NULL ELSE r.price_work + COALESCE(r.price_goods, 0) END AS price`;
    const from = `FROM requests r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.master_id LEFT JOIN users f ON f.id = r.foreman_id`;
    const visits = await this.db.query<Row>(
      `SELECT ${cols}, r.visit_at AS at, r.visit_until AS until ${from}
       WHERE r.visit_at IS NOT NULL AND r.visit_at < $2 AND COALESCE(r.visit_until, r.visit_at + interval '3 hours') > $1
         AND r.status <> 'cancelled' AND r.deleted_at IS NULL`,
      [start, end],
    );
    const surveys = await this.db.query<Row>(
      `SELECT ${cols}, r.survey_at AS at, r.survey_until AS until ${from}
       WHERE r.survey_at IS NOT NULL AND r.survey_at < $2 AND COALESCE(r.survey_until, r.survey_at + interval '3 hours') > $1
         AND r.status NOT IN ('cancelled', 'closed') AND r.deleted_at IS NULL`,
      [start, end],
    );
    const ids = visits.map((v) => v.id);
    const crew = ids.length
      ? await this.db.query<{ request_id: string; name: string; role: string; day_from: string | null; day_to: string | null }>(
          `SELECT c.request_id, u.name, c.role, to_char(c.day_from, 'YYYY-MM-DD') AS day_from, to_char(c.day_to, 'YYYY-MM-DD') AS day_to
           FROM request_crew c JOIN users u ON u.id = c.master_id WHERE c.request_id = ANY($1::text[]) ORDER BY c.created_at`,
          [ids],
        )
      : [];
    const item = (kind: "visit" | "survey") => (r: Row) => ({
      kind,
      id: r.id,
      number: formatRequestNumber(r.number),
      status: r.status,
      category: r.category,
      district: r.district,
      address: r.address,
      at: r.at,
      until: r.until,
      client: { name: r.client_name, phone: r.client_phone },
      price: r.price === null ? null : Number(r.price),
      foreman: r.foreman_name,
      // Визит: старший и помощники, у которых этот день в их днях работы
      crew:
        kind === "survey"
          ? []
          : [
              ...(r.master_name ? [{ name: r.master_name, role: "Старший" }] : []),
              ...crew
                .filter((c) => c.request_id === r.id && !(c.day_from && date < c.day_from) && !(c.day_to && date > c.day_to))
                .map((c) => ({ name: c.name, role: c.role })),
            ],
    });
    const items = [...visits.map(item("visit")), ...surveys.map(item("survey"))].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Согласованы, но время визита не назначено — первое, что нужно распределить
    const unscheduled = await this.db.query<{ id: string; number: number; status: RequestStatus; category: Category; client_name: string; price: string | null }>(
      `SELECT r.id, r.number, r.status, r.category, c.name AS client_name,
              CASE WHEN r.price_work IS NULL THEN NULL ELSE r.price_work + COALESCE(r.price_goods, 0) END AS price
       FROM requests r JOIN users c ON c.id = r.client_id
       WHERE r.visit_at IS NULL AND r.status IN ('agreed', 'invoiced', 'prepaid', 'assigned', 'accepted') AND r.deleted_at IS NULL
       ORDER BY r.created_at`,
    );
    return {
      date,
      items,
      unscheduled: unscheduled.map((u) => ({
        id: u.id,
        number: formatRequestNumber(u.number),
        status: u.status,
        category: u.category,
        client: u.client_name,
        price: u.price === null ? null : Number(u.price),
      })),
    };
  }
}
