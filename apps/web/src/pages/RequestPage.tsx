import {
  BRAND,
  CALCULATORS,
  CATEGORY_LABELS,
  CONTRACT_METHOD_LABELS,
  describeAnswers,
  formatRub,
  STATUS_LABELS,
  UNIT_LABELS,
  type Answers,
  type CalcId,
  type Category,
  type ContractMethod,
  type ItemKind,
  type RequestStatus,
  type Unit,
} from "@ks/core";
import { ArrowLeft, CircleAlert, CircleCheck, FileSignature, Phone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError } from "../api";
import "../calculator.css";
import "../cabinet.css";
import { SiteHeader } from "../components/SiteHeader";

type Item = { id: string; kind: ItemKind; name: string; unit: Unit; qty: number; price: number };
type Estimate = {
  id: string;
  version: number;
  status: "sent" | "approved" | "rejected" | "superseded";
  items: Item[];
  totals: { work: number; goods: number; total: number; reserve: number };
  reservePercent: number;
};
export type ClientRequest = {
  id: string;
  number: string;
  status: RequestStatus;
  category: Category;
  address: string;
  visitAt: string | null;
  visitUntil: string | null;
  master: { name: string } | null;
  calc: { id: CalcId; answers: Answers; totals: { total: number } } | null;
  contract: {
    number: string;
    method: ContractMethod;
    acceptedAt: string;
    client: { name: string; phone: string; companyName: string; inn: string };
    address: string;
    priceWork: number;
    priceGoods: number;
  } | null;
  estimates: Estimate[];
  cancelReason: string;
};

const STEPS = ["Заявка", "Смета и договор", "Мастер", "Работы", "Приёмка и оплата"];

function stepOf(r: ClientRequest): number {
  const s = r.status;
  if (s === "new") return r.estimates.some((e) => e.status === "sent") ? 1 : 0;
  if (s === "agreed" || s === "invoiced" || s === "prepaid") return 2;
  if (s === "assigned" || s === "accepted") return 2;
  if (s === "en_route" || s === "on_site") return 3;
  if (s === "closed") return 5;
  return 4;
}

const MSK = 3 * 3_600_000;
function when(at: string, until: string | null): string {
  const f = (v: string) => new Date(new Date(v).getTime() + MSK);
  const a = f(at);
  const two = (n: number) => String(n).padStart(2, "0");
  const t = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  return `${two(a.getUTCDate())}.${two(a.getUTCMonth() + 1)}, ${t(a)}${until ? `–${t(f(until))}` : ""}`;
}

/** Заявка в личном кабинете клиента: ход работ, смета на согласование, договор (docs/KALKULYATOR.md, раздел 5). */
export function RequestPage() {
  const { id } = useParams();
  const [r, setR] = useState<ClientRequest | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<{ request: ClientRequest }>("GET", `/requests/${id}`)
      .then((x) => setR(x.request))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось загрузить заявку"));
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (r) document.title = `Заявка ${r.number} — ${BRAND.name}`;
  }, [r]);

  return (
    <>
      <SiteHeader />
      <main className="wrap cabinet request-page">
        <Link to="/cabinet" className="back-link">
          <ArrowLeft size={18} />
          Мои заявки
        </Link>
        {error && <div className="error">{error}</div>}
        {!r && !error && <span className="muted">Загрузка…</span>}
        {r && <Request r={r} onChanged={load} />}
      </main>
    </>
  );
}

function Request({ r, onChanged }: { r: ClientRequest; onChanged: () => void }) {
  const step = stepOf(r);
  const est = r.estimates.find((e) => e.status === "sent") ?? r.estimates.find((e) => e.status === "approved") ?? null;
  const calc = r.calc && CALCULATORS[r.calc.id];

  return (
    <>
      <div className="request-head">
        <div>
          <h1>Заявка {r.number}</h1>
          <span className="muted">{CATEGORY_LABELS[r.category]}</span>
        </div>
        <span className={`badge badge-${r.status === "cancelled" ? "danger" : step >= 5 ? "success" : "accent"}`}>{STATUS_LABELS[r.status]}</span>
      </div>

      {r.status === "cancelled" ? (
        <div className="calc-note warn">
          <CircleAlert size={18} />
          <span>Заявка отменена{r.cancelReason ? `: ${r.cancelReason}` : ""}.</span>
        </div>
      ) : (
        <ol className="progress" aria-label="Ход заявки">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
              <span>{i < step ? <CircleCheck size={16} /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      )}

      <div className="request-facts">
        <div>
          <small>Визит</small>
          <b>{r.visitAt ? when(r.visitAt, r.visitUntil) : "согласуем по телефону"}</b>
        </div>
        <div>
          <small>Мастер</small>
          <b>{r.master?.name ?? "назначим после согласования"}</b>
        </div>
        <div>
          <small>Адрес</small>
          <b>{r.address || "уточним при звонке"}</b>
        </div>
      </div>

      {r.calc && !est && calc && (
        <section className="panel">
          <h2>Ваш расчёт на сайте</h2>
          <p className="calc-small">
            Примерно <b>{formatRub(r.calc.totals.total)}</b>. Мы перезвоним, уточним детали и пришлём точную смету сюда — вы согласуете её в один клик.
          </p>
          <ul className="plain-list">
            {describeAnswers(calc, r.calc.answers).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {est && <EstimateSection r={r} est={est} onChanged={onChanged} />}

      {r.contract && (
        <section className="panel contract-done">
          <FileSignature size={22} />
          <div>
            <b>Договор № {r.contract.number} заключён</b>
            <span className="muted">
              {new Date(r.contract.acceptedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} —{" "}
              {CONTRACT_METHOD_LABELS[r.contract.method]}
            </span>
          </div>
          <Link to={`/cabinet/z/${r.id}/dogovor`} className="btn btn-outline btn-sm">
            Открыть договор
          </Link>
        </section>
      )}

      {BRAND.phone && (
        <p className="muted">
          <Phone size={16} style={{ verticalAlign: "-3px", marginRight: 6 }} />
          Вопросы по заявке — звоните{" "}
          <a href={`tel:${BRAND.phone.replace(/[^\d+]/g, "")}`} style={{ fontWeight: 700 }}>
            {BRAND.phone}
          </a>
        </p>
      )}
    </>
  );
}

const KINDS: [ItemKind, string][] = [
  ["work", "Работы"],
  ["material", "Материалы"],
  ["equipment", "Оборудование"],
];

function EstimateSection({ r, est, onChanged }: { r: ClientRequest; est: Estimate; onChanged: () => void }) {
  const [accept, setAccept] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = est.status === "sent";
  const needContract = !r.contract;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не получилось. Попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="estimate">
      <div className="calc-sum">
        <small>{pending ? "Смета на согласование" : "Согласованная смета"}</small>
        <b>{formatRub(est.totals.total)}</b>
        <span className="muted">
          работы {formatRub(est.totals.work)} · материалы и оборудование {formatRub(est.totals.goods)}
        </span>
      </div>
      {KINDS.map(([k, title]) => {
        const lines = est.items.filter((i) => i.kind === k);
        if (!lines.length) return null;
        const sum = lines.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
        return (
          <div key={k} className="calc-lines">
            <h3>
              {title}
              <span>{formatRub(sum)}</span>
            </h3>
            {lines.map((l) => (
              <div key={l.id} className="calc-line">
                <span>{l.name}</span>
                <span className="muted">
                  {String(l.qty).replace(".", ",")} {UNIT_LABELS[l.unit]} × {formatRub(l.price)}
                </span>
                <b>{formatRub(Math.round(l.qty * l.price))}</b>
              </div>
            ))}
          </div>
        );
      })}
      {est.totals.reserve > 0 && (
        <p className="calc-small">
          Резерв на непредвиденные работы {est.reservePercent}% — {formatRub(est.totals.reserve)}. Оплачивается, только если понадобится и вы согласуете.
        </p>
      )}

      {pending && (
        <div className="approve">
          {needContract && (
            <label className="check">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>
                Принимаю условия{" "}
                <Link to={`/cabinet/z/${r.id}/dogovor`} target="_blank">
                  договора подряда
                </Link>{" "}
                с {BRAND.legalName}. Согласование из личного кабинета — моя простая электронная подпись.
              </span>
            </label>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="approve-actions">
            <button
              className="btn btn-primary"
              disabled={busy || (needContract && !accept)}
              onClick={() => run(() => api("POST", `/estimates/${est.id}/approve`, { acceptContract: accept }))}
            >
              {needContract ? "Согласен, заключить договор" : "Согласовать смету"}
            </button>
            {!rejecting && (
              <button className="btn btn-outline" onClick={() => setRejecting(true)}>
                Не согласен
              </button>
            )}
          </div>
          {rejecting && (
            <div className="reject">
              <label className="field">
                <span>Что не устроило в смете</span>
                <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </label>
              <button className="btn btn-outline" disabled={busy || reason.trim().length < 3} onClick={() => run(() => api("POST", `/estimates/${est.id}/reject`, { reason }))}>
                Отправить
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
