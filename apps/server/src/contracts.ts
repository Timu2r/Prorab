import { CONTRACT_VERSION, formatRequestNumber, type ContractMethod } from "@ks/core";
import type { Queryable } from "./db";
import { logEvent, type By } from "./flow";
import { newId } from "./util";

type ContractRow = {
  number: string;
  method: ContractMethod;
  terms_version: string;
  accepted_at: Date;
  accepted_by_name: string;
  client_name: string;
  client_phone: string;
  company_name: string;
  company_inn: string;
  address: string;
  price_work: string;
  price_goods: string;
};

/** Договор заявки: снимок данных на момент заключения. null — договор ещё не заключён. */
export async function loadContract(q: Queryable, requestId: string) {
  const [c] = await q.query<ContractRow>(
    `SELECT c.*, u.name AS accepted_by_name FROM contracts c JOIN users u ON u.id = c.accepted_by WHERE c.request_id = $1`,
    [requestId],
  );
  if (!c) return null;
  return {
    number: c.number,
    method: c.method,
    termsVersion: c.terms_version,
    acceptedAt: c.accepted_at,
    acceptedBy: c.accepted_by_name,
    client: { name: c.client_name, phone: c.client_phone, companyName: c.company_name, inn: c.company_inn },
    address: c.address,
    priceWork: Number(c.price_work),
    priceGoods: Number(c.price_goods),
  };
}

export type ContractView = NonNullable<Awaited<ReturnType<typeof loadContract>>>;

export async function hasContract(q: Queryable, requestId: string): Promise<boolean> {
  return (await q.query(`SELECT 1 FROM contracts WHERE request_id = $1`, [requestId])).length > 0;
}

/**
 * Заключает договор при первом согласовании сметы (docs/KALKULYATOR.md, раздел 6). Дальнейшие версии сметы
 * договор не меняют: по договору действует последняя согласованная смета.
 */
export async function ensureContract(
  q: Queryable,
  requestId: string,
  estimateId: string,
  by: By & { userId: string },
  method: ContractMethod,
  ip: string,
  prices: { work: number; goods: number },
): Promise<boolean> {
  if (await hasContract(q, requestId)) return false;
  const [r] = await q.query<{ number: number; name: string; phone: string; address: string; apartment: string; company_name: string | null; inn: string | null; type: string | null }>(
    `SELECT r.number, c.name, c.phone, r.address, r.apartment, p.company_name, p.inn, p.type
     FROM requests r JOIN users c ON c.id = r.client_id LEFT JOIN client_profiles p ON p.user_id = r.client_id WHERE r.id = $1`,
    [requestId],
  );
  const company = r!.type === "company" ? (r!.company_name ?? "") : "";
  const number = formatRequestNumber(r!.number);
  await q.query(
    `INSERT INTO contracts (id, request_id, number, estimate_id, terms_version, method, accepted_by, ip, client_name, client_phone, company_name, company_inn, address, price_work, price_goods)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      newId("ctr"),
      requestId,
      number,
      estimateId,
      CONTRACT_VERSION,
      method,
      by.userId,
      ip,
      r!.name,
      r!.phone,
      company,
      company ? (r!.inn ?? "") : "",
      [r!.address, r!.apartment && `кв. ${r!.apartment}`].filter(Boolean).join(", "),
      prices.work,
      prices.goods,
    ],
  );
  await logEvent(q, requestId, by, "contract", { number, method, version: CONTRACT_VERSION });
  return true;
}
