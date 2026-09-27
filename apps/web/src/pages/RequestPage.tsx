import {
  BRAND,
  CALCULATORS,
  CATEGORY_LABELS,
  CONTRACT_METHOD_LABELS,
  describeAnswers,
  formatPhone,
  formatRub,
  INVOICE_KIND_LABELS,
  UNIT_LABELS,
  type Answers,
  type CalcId,
  type Category,
  type ContractMethod,
  type InvoiceKind,
  type ItemKind,
  type RequestStatus,
  type Unit,
} from "@ks/core";
import { ArrowLeft, CircleAlert, CircleCheck, FileSignature, HardHat, Phone, ReceiptText, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError, apiUrl } from "../api";
import { useAuth } from "../auth";
import "../calculator.css";
import "../cabinet.css";
import { SiteHeader } from "../components/SiteHeader";
import { dateText, MASTER_STATE_LABELS, STAGE_LABELS, STAGES, stageOf, visitText, type MasterState } from "../orders";
import { ConfirmPhone } from "./Cabinet";

type Item = { id: string; kind: ItemKind; name: string; unit: Unit; qty: number; price: number };
type Estimate = {
  id: string;
  version: number;
  status: "sent" | "approved" | "rejected" | "superseded";
  items: Item[];
  totals: { work: number; goods: number; total: number; reserve: number };
  reservePercent: number;
};
type Invoice = { id: string; number: string; kind: InvoiceKind; amount: number; status: "sent" | "paid" | "refunded"; paidAt: string | null };
type Contract = {
  number: string;
  method: ContractMethod;
  acceptedAt: string;
  /** Без кода сервер отдаёт только номер, способ и дату: в документе имя и телефон владельца номера. */
  client?: { name: string; phone: string; companyName: string; inn: string };
  address?: string;
  priceWork?: number;
  priceGoods?: number;
};

export type ClientRequest = {
  id: string;
  number: string;
  status: RequestStatus;
  category: Category;
  address: string;
  apartment: string;
  visitAt: string | null;
  visitUntil: string | null;
  /** Выезд прораба на объект до договора: осмотр, замер, договор и аванс (docs/TZ.md, 16.9). */
  surveyAt: string | null;
  surveyUntil: string | null;
  /** Фото клиента, а после «Готово» — фото до и после работ и бумажный акт. Ссылки подписаны на 1 час. */
  files: { id: string; kind: string; url: string }[];
  acts: { accepted: boolean; remarks: string; method: "app" | "paper"; signedAt: string }[];
  /** Номер из заявки — его подтверждают кодом. */
  phone: string;
  /** false — смотрим без кода или заявку на чужой номер: согласовать нельзя. */
  canAct: boolean;
  foreman: { name: string; phone: string } | null;
  team: { name: string; role: string; area: string; state: MasterState }[];
  calc: { id: CalcId; answers: Answers; totals: { total: number } } | null;
  contract: Contract | null;
  estimates: Estimate[];
  invoices: Invoice[];
  warrantyUntil: string | null;
  cancelReason: string;
};

const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Что происходит сейчас и что будет дальше — одной фразой под этапами. */
function nowText(r: ClientRequest): string {
  const visit = r.visitAt ? visitText(r.visitAt, r.visitUntil) : null;
  switch (r.status) {
    case "new":
      if (r.estimates.some((e) => e.status === "sent")) return "Смета готова — посмотрите её ниже и согласуйте.";
      if (r.surveyAt) return `Прораб приедет на объект ${visitText(r.surveyAt, r.surveyUntil)}: осмотрит, замерит и уточнит смету. Договор и аванс — на этой встрече.`;
      return "Прораб позвонит в течение 15 минут в рабочее время, с 9 до 21: уточнит детали и пришлёт смету сюда.";
    case "agreed":
      return visit ? `Смета согласована. Подбираем мастера на ${visit}.` : "Смета согласована. Прораб согласует с вами день визита и подберёт мастера.";
    case "invoiced":
      return "Счёт на материалы выставлен — оплата при встрече с прорабом.";
    case "prepaid":
      return "Материалы оплачены. Подбираем мастера.";
    case "assigned":
      return "Мастер назначен и скоро подтвердит заказ.";
    case "accepted":
      return visit ? `Мастер подтвердил заказ и приедет ${visit}.` : "Мастер подтвердил заказ.";
    case "en_route":
      return "Мастер едет к вам.";
    case "on_site":
      return "Мастер на месте, идут работы.";
    case "done":
      return r.acts.some((a) => !a.accepted)
        ? "Мы получили ваши замечания — прораб свяжется с вами и договорится, как их исправить."
        : "Работы выполнены. Посмотрите фото ниже и примите работу — или напишите замечания.";
    case "act_signed":
      return "Работа принята. Оплата — при встрече с прорабом.";
    case "paid":
      return "Заказ оплачен, спасибо.";
    case "closed":
      return r.warrantyUntil ? `Заказ завершён. Гарантия до ${dateText(r.warrantyUntil)}.` : "Заказ завершён.";
    case "cancelled":
      return "";
  }
}

/** Заявка в «Мои заказы»: этапы, кто работает, смета, договор, счета (docs/TZ.md, 16.4). */
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
          Мои заказы
        </Link>
        {error && <div className="error">{error}</div>}
        {!r && !error && <span className="muted">Загрузка…</span>}
        {r && <Request r={r} onChanged={load} />}
      </main>
    </>
  );
}

function Request({ r, onChanged }: { r: ClientRequest; onChanged: () => void }) {
  const { user } = useAuth();
  const device = user?.scope === "device";
  const step = stageOf(r.status);
  const est = r.estimates.find((e) => e.status === "sent") ?? r.estimates.find((e) => e.status === "approved") ?? null;
  const calc = r.calc && CALCULATORS[r.calc.id];
  const cancelled = r.status === "cancelled";

  return (
    <>
      <div className="request-head">
        <div>
          <h1>Заявка {r.number}</h1>
          <span className="muted">{CATEGORY_LABELS[r.category]}</span>
        </div>
        <span className={`badge badge-${cancelled ? "danger" : step >= STAGES.length ? "success" : "accent"}`}>{STAGE_LABELS[r.status]}</span>
      </div>

      {cancelled ? (
        <div className="calc-note warn">
          <CircleAlert size={18} />
          <span>Заявка отменена{r.cancelReason ? `: ${r.cancelReason}` : ""}.</span>
        </div>
      ) : (
        <div className="stage">
          <ol className="progress" aria-label="Ход заказа">
            {STAGES.map((s, i) => (
              <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
                <span>{i < step ? <CircleCheck size={16} /> : i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="stage-now">{nowText(r)}</p>
        </div>
      )}

      {!r.canAct &&
        !cancelled &&
        // Смета ждёт согласования — у неё своя кнопка «Подтвердить номер и согласовать»
        !(device && est?.status === "sent") &&
        (device ? (
          <ConfirmPhone text="Вы смотрите заказ без входа. Чтобы согласовать смету и открыть договор, подтвердите номер кодом из звонка." />
        ) : (
          <div className="calc-note">
            <CircleAlert size={18} />
            <span>Заявка оформлена на номер {formatPhone(r.phone)}. Согласовать смету может только владелец этого номера — со своего телефона.</span>
          </div>
        ))}

      <div className="request-facts">
        {r.surveyAt && (
          <div>
            <small>Выезд прораба</small>
            <b>{visitText(r.surveyAt, r.surveyUntil)}</b>
          </div>
        )}
        <div>
          <small>Визит мастера</small>
          <b>{r.visitAt ? visitText(r.visitAt, r.visitUntil) : "согласуем по телефону"}</b>
        </div>
        <div>
          <small>Адрес</small>
          <b>{r.address ? `${r.address}${r.apartment ? `, кв. ${r.apartment}` : ""}` : "уточним при звонке"}</b>
        </div>
      </div>

      <Team r={r} />

      {r.calc && !est && calc && (
        <section className="panel">
          <h2>Ваш расчёт на сайте</h2>
          <p className="calc-small">
            Примерно <b>{formatRub(r.calc.totals.total)}</b>. Прораб уточнит детали и пришлёт точную смету сюда — вы согласуете её в один клик.
          </p>
          <ul className="plain-list">
            {describeAnswers(calc, r.calc.answers).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {est && <EstimateSection r={r} est={est} device={device} onChanged={onChanged} />}

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
          {r.canAct ? (
            <Link to={`/cabinet/z/${r.id}/dogovor`} className="btn btn-outline btn-sm">
              Открыть договор
            </Link>
          ) : device ? (
            <Link to={`/login?next=${encodeURIComponent(`/cabinet/z/${r.id}/dogovor`)}`} className="btn btn-outline btn-sm">
              Открыть по коду
            </Link>
          ) : null}
        </section>
      )}

      <Photos files={r.files} />

      {r.status === "done" && <Acceptance r={r} device={device} onChanged={onChanged} />}

      {r.invoices.length > 0 && <Invoices invoices={r.invoices} />}

      {!cancelled && <Rules />}
    </>
  );
}

/** Кто работает: прораб заказа с телефоном и мастера — имя, за что отвечает, что делает сейчас. */
function Team({ r }: { r: ClientRequest }) {
  const phone = r.foreman?.phone || BRAND.phone;
  const pending =
    r.status === "assigned"
      ? "Мастер назначен и скоро подтвердит заказ — тогда здесь появится его имя."
      : r.status === "new"
        ? "Мастера подберём после согласования сметы."
        : ["agreed", "invoiced", "prepaid"].includes(r.status)
          ? "Подбираем мастера: здесь появится, кто приедет и за что отвечает."
          : null;
  return (
    <section className="panel team">
      <h2>Кто работает</h2>
      <div className="team-row">
        <span className="team-ico">
          <UserRound size={20} />
        </span>
        <div className="team-who">
          <b>{r.foreman ? r.foreman.name || "Прораб" : "Прораб заказа"}</b>
          <span className="muted">{r.foreman ? "Прораб заказа: ведёт заказ, отвечает на вопросы, приезжает на встречи" : "Назначим при звонке — пока звоните в компанию"}</span>
        </div>
        {phone && (
          <a className="btn btn-outline btn-sm" href={tel(phone)} aria-label={`Позвонить ${phone}`}>
            <Phone size={16} />
            <span className="only-lg">{formatPhone(phone.replace(/[^\d+]/g, ""))}</span>
            <span className="only-sm">Позвонить</span>
          </a>
        )}
      </div>
      {r.team.map((m) => (
        <div className="team-row" key={`${m.name}-${m.role}`}>
          <span className="team-ico">
            <HardHat size={20} />
          </span>
          <div className="team-who">
            <b>{m.name}</b>
            <span className="muted">
              {m.role}
              {m.area ? ` · ${m.area}` : ""}
            </span>
          </div>
          <span className={`team-state state-${m.state}`}>{MASTER_STATE_LABELS[m.state]}</span>
        </div>
      ))}
      {!r.team.length && pending && <p className="muted team-pending">{pending}</p>}
    </section>
  );
}

/** Фото работ: до и после — видны, когда мастер нажал «Готово». */
function Photos({ files }: { files: ClientRequest["files"] }) {
  const groups: [string, string][] = [
    ["before", "До работ"],
    ["after", "После работ"],
    ["act_paper", "Подписанный акт"],
  ];
  const shown = groups.filter(([k]) => files.some((f) => f.kind === k));
  if (!shown.length) return null;
  return (
    <section className="panel">
      <h2>Фото работ</h2>
      {shown.map(([k, title]) => (
        <div key={k} className="photo-group">
          <h3>{title}</h3>
          <div className="photo-grid">
            {files
              .filter((f) => f.kind === k)
              .map((f, i) => (
                <a key={f.id} href={apiUrl(f.url)} target="_blank" rel="noreferrer">
                  <img src={apiUrl(f.url)} alt={`${title}, фото ${i + 1}`} loading="lazy" />
                </a>
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Приёмка: «Принять работу» или «Есть замечания». Это подпись под актом — только после кода (docs/TZ.md, 9.4). */
function Acceptance({ r, device, onChanged }: { r: ClientRequest; device: boolean; onChanged: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async (accepted: boolean) => {
    setBusy(true);
    setError("");
    try {
      await api("POST", `/requests/${r.id}/act`, { accepted, remarks });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не получилось. Попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };
  if (!r.canAct)
    return device ? (
      <div className="approve">
        <span className="calc-small">Принять работу — это подпись под актом. Подтвердите номер кодом из звонка, и вы вернётесь сюда.</span>
        <div className="approve-actions">
          <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/cabinet/z/${r.id}`)}`}>
            Подтвердить номер и принять работу
          </Link>
        </div>
      </div>
    ) : null;
  return (
    <div className="approve">
      <b>Работы выполнены. Всё в порядке?</b>
      <span className="calc-small">«Принять работу» — ваша подпись под актом: работы выполнены, претензий нет. Гарантия {BRAND.warrantyMonths} месяцев начнётся после расчёта.</span>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="approve-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => send(true)}>
          Принять работу
        </button>
        {!writing && (
          <button className="btn btn-outline" onClick={() => setWriting(true)}>
            Есть замечания
          </button>
        )}
      </div>
      {writing && (
        <div className="reject">
          <label className="field">
            <span>Что не так</span>
            <textarea className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={2000} placeholder="Например: на стене остались следы от сверления" />
          </label>
          <button className="btn btn-outline" disabled={busy || remarks.trim().length < 3} onClick={() => send(false)}>
            Отправить прорабу
          </button>
        </div>
      )}
    </div>
  );
}

/** Счета на старте оплачиваются при встрече с прорабом (решение владельца 2026-09-27, docs/TZ.md, 16.5). */
function Invoices({ invoices }: { invoices: Invoice[] }) {
  return (
    <section className="panel">
      <h2>Счета</h2>
      <div className="invoices">
        {invoices.map((i) => (
          <div key={i.id} className="invoice-row">
            <ReceiptText size={20} />
            <div className="team-who">
              <b>
                {INVOICE_KIND_LABELS[i.kind]} — {formatRub(i.amount)}
              </b>
              <span className="muted">Счёт № {i.number}</span>
            </div>
            <span className={`team-state${i.status === "paid" ? " state-done" : ""}`}>
              {i.status === "paid" ? `Оплачен${i.paidAt ? ` ${dateText(i.paidAt)}` : ""}` : i.status === "refunded" ? "Возврат" : "Оплата при встрече"}
            </span>
          </div>
        ))}
      </div>
      <p className="calc-small">Оплата — на счёт {BRAND.legalName} по QR-коду или ссылке банка при встрече с прорабом. Чек пришлёт банк.</p>
    </section>
  );
}

/** Правила, которые защищают клиента и компанию (docs/TZ.md, 16.8). */
function Rules() {
  return (
    <section className="panel rules">
      <h2>
        <ShieldCheck size={20} />
        Важно
      </h2>
      <ul>
        <li>Деньги мастеру не передавайте: оплата — только на счёт {BRAND.legalName} при встрече с прорабом.</li>
        <li>Дополнительные работы — только через смету в этом кабинете. Договорённости с мастером «на месте» мы не гарантируем.</li>
        <li>
          Гарантия {BRAND.warrantyMonths} месяцев — на работы, оформленные через «{BRAND.name}».
        </li>
      </ul>
    </section>
  );
}

const KINDS: [ItemKind, string][] = [
  ["work", "Работы"],
  ["material", "Материалы"],
  ["equipment", "Оборудование"],
];

function EstimateSection({ r, est, device, onChanged }: { r: ClientRequest; est: Estimate; device: boolean; onChanged: () => void }) {
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

      {pending && !r.canAct && device && (
        <div className="approve">
          <span className="calc-small">
            Код из звонка — ваша подпись под сметой и{" "}
            <Link to="/dogovor" target="_blank">
              договором
            </Link>
            . После него вернётесь сюда и согласуете в один клик.
          </span>
          <div className="approve-actions">
            <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/cabinet/z/${r.id}`)}`}>
              Подтвердить номер и согласовать
            </Link>
          </div>
        </div>
      )}

      {pending && r.canAct && (
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
