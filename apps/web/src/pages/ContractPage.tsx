import { BRAND, CATEGORY_LABELS, contractDocument, formatRub, UNIT_LABELS } from "@ks/core";
import { ArrowLeft, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import "../cabinet.css";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import type { ClientRequest } from "./RequestPage";

/**
 * Договор подряда. /dogovor — шаблон без данных (условия заранее видны всем), /cabinet/z/:id/dogovor — договор заявки:
 * заключённый — со снимком данных на момент заключения, ещё не заключённый — предпросмотр с ценой из сметы.
 */
export function ContractPage({ template = false }: { template?: boolean }) {
  const { id } = useParams();
  const { user } = useAuth();
  const [r, setR] = useState<ClientRequest | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = `Договор подряда — ${BRAND.name}`;
    if (template) return;
    api<{ request: ClientRequest }>("GET", `/requests/${id}`)
      .then((x) => setR(x.request))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить договор"));
  }, [id, template]);

  const est = r ? (r.estimates.find((e) => e.status === "approved") ?? r.estimates.find((e) => e.status === "sent") ?? null) : null;
  const c = r?.contract ?? null;
  const doc = template
    ? contractDocument(null)
    : r
      ? contractDocument({
          number: r.number,
          date: c?.acceptedAt ?? null,
          client: c?.client ?? (user ? { name: user.name, phone: user.phone } : null),
          address: c?.address ?? r.address,
          category: CATEGORY_LABELS[r.category],
          priceWork: est?.totals.work ?? c?.priceWork ?? null,
          priceGoods: est?.totals.goods ?? c?.priceGoods ?? null,
          method: c?.method ?? null,
        })
      : null;

  return (
    <>
      <SiteHeader />
      <main className="wrap doc contract">
        <div className="contract-tools">
          {!template && (
            <Link to={`/cabinet/z/${id}`} className="back-link">
              <ArrowLeft size={18} />К заявке
            </Link>
          )}
          {doc && (
            <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
              <Printer size={18} />
              Распечатать
            </button>
          )}
        </div>
        {error && <div className="error">{error}</div>}
        {!doc && !error && <span className="muted">Загрузка…</span>}
        {doc && (
          <article>
            {!template && !c && <div className="contract-draft">Договор ещё не заключён. Он заключится, когда вы согласуете смету в личном кабинете.</div>}
            {template && (
              <p className="muted">
                Условия, по которым мы работаем. Номер, ваши данные, адрес и цена подставляются в личном кабинете — договор заключается, когда вы согласуете смету.
              </p>
            )}
            <h1>{doc.title}</h1>
            <p className="muted">{doc.place}</p>
            <p>{doc.preamble}</p>
            {doc.sections.map((s) => (
              <section key={s.title}>
                <h2>{s.title}</h2>
                {s.items.map((p, i) => (
                  <p key={i}>
                    {s.title.split(".")[0]}.{i + 1}. {p}
                  </p>
                ))}
              </section>
            ))}
            <section className="parties">
              <div>
                <h2>Подрядчик</h2>
                {doc.contractor.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
              <div>
                <h2>Заказчик</h2>
                {doc.customer.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            </section>
            {doc.accepted && <p className="contract-accepted">{doc.accepted}</p>}
            {est && (
              <section>
                <h2>Приложение 1. Смета</h2>
                <table className="contract-table">
                  <thead>
                    <tr>
                      <th>Позиция</th>
                      <th>Кол-во</th>
                      <th>Цена</th>
                      <th>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {est.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.name}</td>
                        <td>
                          {String(i.qty).replace(".", ",")} {UNIT_LABELS[i.unit]}
                        </td>
                        <td>{formatRub(i.price)}</td>
                        <td>{formatRub(Math.round(i.qty * i.price))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Итого</td>
                      <td>{formatRub(est.totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            )}
          </article>
        )}
      </main>
      {template && <SiteFooter />}
    </>
  );
}
