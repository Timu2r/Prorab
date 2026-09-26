import type { ItemKind, PriceItem, Unit } from "@ks/core";
import type { Queryable } from "./db";

/** Позиции прайса по умолчанию — их id «svc_<key>», по ключу к ним обращается калькулятор. */
export const DEFAULT_ID = "svc_";

export type PriceItemWithCost = PriceItem & { serviceId: string; cost: number | null };

/** Прайс для калькулятора: включённые позиции по умолчанию с ключами. Выключенные калькулятор пропускает. */
export async function loadPriceItems(q: Queryable): Promise<PriceItemWithCost[]> {
  const rows = await q.query<{ id: string; kind: ItemKind; name: string; unit: string; price: string | null; cost: string | null }>(
    `SELECT id, kind, name, unit, price, cost FROM services WHERE active AND id LIKE '${DEFAULT_ID}%' ORDER BY sort`,
  );
  return rows.map((r) => ({
    key: r.id.slice(DEFAULT_ID.length),
    serviceId: r.id,
    kind: r.kind,
    name: r.name,
    unit: r.unit as Unit,
    price: r.price === null ? null : Number(r.price),
    cost: r.cost === null ? null : Number(r.cost),
  }));
}
