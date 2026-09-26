import {
  BRAND,
  CALCULATORS,
  CATEGORY_LABELS,
  describeAnswers,
  fieldVisible,
  formatRub,
  normalizeAnswers,
  quote,
  UNIT_LABELS,
  type Answers,
  type CalcField,
  type CalcId,
  type ItemKind,
  type PriceItem,
  type Quote,
} from "@ks/core";
import { ArrowLeft, CircleAlert, CircleCheck, Info, MessageSquareText, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../api";
import "../calculator.css";
import { DIRECTIONS } from "../directions";
import { formatPhoneInput } from "./LeadForm";

/**
 * Расчёт стоимости на сайте (docs/KALKULYATOR.md): направление → вопросы → расчёт → согласие → контакты → готово.
 * Цена считается здесь же по прайсу с сервера; при отправке сервер пересчитывает ответы по своему прайсу.
 */

export type CalcStart = { calc: CalcId | "general" | null };
type Step = "pick" | "questions" | "result" | "contacts" | "done";

// Прайс грузится один раз за визит: открыть окно второй раз — без ожидания
let pricesPromise: Promise<Map<string, PriceItem>> | null = null;
function loadPrices() {
  pricesPromise ??= api<{ items: PriceItem[] }>("GET", "/public/calculator")
    .then((r) => new Map(r.items.map((i) => [i.key, i])))
    .catch((e) => {
      pricesPromise = null;
      throw e;
    });
  return pricesPromise;
}

const STEP_NO: Record<Step, number> = { pick: 1, questions: 2, result: 3, contacts: 4, done: 4 };

export function CalculatorDialog({ start, onClose }: { start: CalcStart; onClose: () => void }) {
  const [calcId, setCalcId] = useState<CalcId | null>(start.calc && start.calc !== "general" ? start.calc : null);
  const [step, setStep] = useState<Step>(start.calc === "general" ? "contacts" : start.calc ? "questions" : "pick");
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [prices, setPrices] = useState<Map<string, PriceItem> | null>(null);
  const [pricesError, setPricesError] = useState("");
  const [done, setDone] = useState<{ number: string | null; total: number | null } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const calc = calcId ? CALCULATORS[calcId] : null;
  const answers = useMemo(() => (calc ? normalizeAnswers(calc, raw) : {}), [calc, raw]);
  const q = useMemo(() => (calcId && prices ? quote(calcId, answers, prices) : null), [calcId, answers, prices]);

  useEffect(() => {
    loadPrices()
      .then(setPrices)
      .catch(() => setPricesError("Не удалось загрузить цены. Оставьте заявку — посчитаем при звонке."));
  }, []);

  // Окно поверх страницы: прокрутка страницы выключена, Esc закрывает
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    dialog.current?.querySelector(".calc-body")?.scrollTo({ top: 0 });
    dialog.current?.focus();
  }, [step]);

  const choose = (id: CalcId | "general") => {
    if (id === "general") {
      setCalcId(null);
      setStep("contacts");
    } else {
      if (id !== calcId) setRaw({});
      setCalcId(id);
      setStep("questions");
    }
  };

  const back = () => {
    if (step === "questions") setStep("pick");
    else if (step === "result") setStep("questions");
    else if (step === "contacts") setStep(calcId ? "result" : "pick");
  };

  const title =
    step === "pick"
      ? "Что нужно сделать?"
      : step === "done"
        ? "Заявка принята"
        : step === "contacts"
          ? "Куда перезвонить"
          : calc
            ? calc.title
            : "Расчёт стоимости";

  return (
    <div className="calc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="calc-dialog" role="dialog" aria-modal="true" aria-labelledby="calc-title" tabIndex={-1} ref={dialog}>
        <header className="calc-head">
          {step !== "pick" && step !== "done" ? (
            <button className="icon-btn" onClick={back} aria-label="Назад">
              <ArrowLeft size={20} />
            </button>
          ) : (
            <span />
          )}
          <div className="calc-head-title">
            {step !== "done" && <small>Шаг {STEP_NO[step]} из 4</small>}
            <h2 id="calc-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        {step === "pick" && <Pick onChoose={choose} />}
        {step === "questions" && calc && (
          <Questions
            fields={calc.fields}
            intro={calc.intro}
            answers={answers}
            onChange={(id, v) => setRaw((r) => ({ ...normalizeAnswers(calc, r), [id]: v }))}
            q={q}
            pricesError={pricesError}
            onNext={() => setStep("result")}
          />
        )}
        {step === "result" && calc && q && <Result q={q} answersText={describeAnswers(calc, answers)} onAgree={() => setStep("contacts")} onEdit={() => setStep("questions")} />}
        {step === "contacts" && (
          <Contacts
            calcId={calcId}
            answers={answers}
            total={q?.totals.total ?? null}
            onDone={(r) => {
              setDone(r);
              setStep("done");
            }}
          />
        )}
        {step === "done" && done && <Done number={done.number} total={done.total} onClose={onClose} />}
      </div>
    </div>
  );
}

function Pick({ onChoose }: { onChoose: (id: CalcId | "general") => void }) {
  return (
    <div className="calc-body">
      <p className="calc-lead">Выберите направление. Примерная цена — сразу, без звонка и регистрации.</p>
      <div className="calc-pick">
        {DIRECTIONS.map(({ category, Icon }) => (
          <button key={category} className="calc-pick-item" onClick={() => onChoose(category)}>
            <Icon size={22} />
            <span>
              <b>{CATEGORY_LABELS[category]}</b>
              <small>{CALCULATORS[category].intro}</small>
            </span>
          </button>
        ))}
        <button className="calc-pick-item calc-pick-other" onClick={() => onChoose("general")}>
          <MessageSquareText size={22} />
          <span>
            <b>Другая задача</b>
            <small>Опишите своими словами — перезвоним и посчитаем</small>
          </span>
        </button>
      </div>
    </div>
  );
}

function Questions({
  fields,
  intro,
  answers,
  onChange,
  q,
  pricesError,
  onNext,
}: {
  fields: readonly CalcField[];
  intro: string;
  answers: Answers;
  onChange: (id: string, v: unknown) => void;
  q: Quote | null;
  pricesError: string;
  onNext: () => void;
}) {
  const warn = q?.notes.find((n) => n.tone === "warn" && n.text.startsWith("Укажите"));
  return (
    <>
      <div className="calc-body">
        <p className="calc-lead">{intro}</p>
        {fields
          .filter((f) => fieldVisible(f, answers))
          .map((f) => (
            <FieldView key={f.id} f={f} value={answers[f.id]!} onChange={(v) => onChange(f.id, v)} />
          ))}
      </div>
      <footer className="calc-foot">
        <div className="calc-total">
          <small>Примерно</small>
          <b>{pricesError ? "—" : q ? formatRub(q.totals.total) : "считаем…"}</b>
        </div>
        <button className="btn btn-primary" onClick={onNext} disabled={!q || !!warn || q.lines.length === 0}>
          Посмотреть расчёт
        </button>
      </footer>
      {pricesError && <div className="calc-inline-error">{pricesError}</div>}
    </>
  );
}

function FieldView({ f, value, onChange }: { f: CalcField; value: string | number | boolean; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (f.type === "choice")
    return (
      <fieldset className="calc-field">
        <legend>{f.label}</legend>
        {f.hint && <p className="calc-hint">{f.hint}</p>}
        <div className="calc-options">
          {f.options.map((o) => (
            <label key={o.value} className={`calc-option${value === o.value ? " on" : ""}`}>
              <input type="radio" name={f.id} checked={value === o.value} onChange={() => onChange(o.value)} />
              <span>
                <b>{o.label}</b>
                {o.hint && <small>{o.hint}</small>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  if (f.type === "toggle")
    return (
      <label className={`calc-toggle${value ? " on" : ""}`}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <b>{f.label}</b>
          {f.hint && <small>{f.hint}</small>}
        </span>
      </label>
    );
  if (f.type === "count") {
    const n = Number(value);
    return (
      <div className="calc-field calc-count">
        <div>
          <span className="calc-label">{f.label}</span>
          {f.hint && <p className="calc-hint">{f.hint}</p>}
        </div>
        <div className="stepper">
          <button type="button" onClick={() => onChange(n - 1)} disabled={n <= f.min} aria-label={`${f.label}: меньше`}>
            <Minus size={18} />
          </button>
          <output aria-live="polite">{n}</output>
          <button type="button" onClick={() => onChange(n + 1)} disabled={n >= f.max} aria-label={`${f.label}: больше`}>
            <Plus size={18} />
          </button>
        </div>
      </div>
    );
  }
  return (
    <label className="calc-field">
      <span className="calc-label">{f.label}</span>
      {f.hint && <span className="calc-hint">{f.hint}</span>}
      <span className="calc-size">
        <input
          className="input"
          inputMode="decimal"
          value={draft ?? String(value).replace(".", ",")}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d.,]/g, "");
            setDraft(v);
            const n = Number(v.replace(",", "."));
            if (v && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
        />
        <span>{f.unit}</span>
      </span>
      <span className="calc-hint">
        от {f.min} до {f.max} {f.unit}
      </span>
    </label>
  );
}

const KIND_ORDER: ItemKind[] = ["work", "material", "equipment"];
const KIND_TITLES: Record<ItemKind, string> = { work: "Работы", material: "Материалы", equipment: "Оборудование" };

function Result({ q, answersText, onAgree, onEdit }: { q: Quote; answersText: string[]; onAgree: () => void; onEdit: () => void }) {
  return (
    <>
      <div className="calc-body">
        <div className="calc-sum">
          <small>Примерная стоимость</small>
          <b>{formatRub(q.totals.total)}</b>
          <span className="muted">
            {KIND_ORDER.filter((k) => subtotal(q, k) > 0)
              .map((k) => `${KIND_TITLES[k].toLowerCase()} ${formatRub(subtotal(q, k))}`)
              .join(" · ")}
          </span>
        </div>

        {q.notes.map((n, i) => (
          <div key={i} className={`calc-note ${n.tone}`}>
            {n.tone === "warn" ? <CircleAlert size={18} /> : <Info size={18} />}
            <span>{n.text}</span>
          </div>
        ))}

        {KIND_ORDER.map((k) => {
          const lines = q.lines.filter((l) => l.kind === k);
          if (!lines.length) return null;
          return (
            <section key={k} className="calc-lines">
              <h3>
                {KIND_TITLES[k]}
                <span>{formatRub(subtotal(q, k))}</span>
              </h3>
              {lines.map((l) => (
                <div key={l.key} className="calc-line">
                  <span>{l.name}</span>
                  <span className="muted">
                    {String(l.qty).replace(".", ",")} {UNIT_LABELS[l.unit]}
                    {l.price !== null && ` × ${formatRub(l.price)}`}
                  </span>
                  <b>{l.total === null ? "по смете" : formatRub(l.total)}</b>
                </div>
              ))}
            </section>
          );
        })}
        {q.totals.reserve > 0 && (
          <p className="calc-small">
            Резерв на непредвиденные работы {q.reservePercent}% — {formatRub(q.totals.reserve)}. В сумму не входит, оплачивается только если понадобится.
          </p>
        )}
        {q.unpriced > 0 && <p className="calc-small">Строки «по смете» не вошли в сумму — их цену назовём при звонке.</p>}

        <details className="calc-answers">
          <summary>Ваши ответы</summary>
          <ul>
            {answersText.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </details>
        <p className="calc-small">
          Цена предварительная. Точную сумму назовём после звонка, а если нужно — после осмотра. Итоговая цена фиксируется в смете и договоре, дополнительные работы — только с
          вашего согласия.
        </p>
      </div>
      <footer className="calc-foot calc-foot-stack">
        <button className="btn btn-outline" onClick={onEdit}>
          Изменить ответы
        </button>
        <button className="btn btn-primary" onClick={onAgree}>
          Согласен, жду звонка
        </button>
      </footer>
    </>
  );
}

function subtotal(q: Quote, k: ItemKind): number {
  return k === "work" ? q.totals.work : k === "material" ? q.totals.materials : q.totals.equipment;
}

function Contacts({
  calcId,
  answers,
  total,
  onDone,
}: {
  calcId: CalcId | null;
  answers: Answers;
  total: number | null;
  onDone: (r: { number: string | null; total: number | null }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Как к вам обращаться?");
    if (phone.replace(/\D/g, "").length < 11) return setError("Введите телефон полностью");
    if (!calcId && comment.trim().length < 5) return setError("Опишите задачу хотя бы парой слов");
    if (!consent) return setError("Отметьте согласие на обработку персональных данных");
    setBusy(true);
    try {
      const r = await api<{ number: string | null; total: number | null }>("POST", "/public/leads", {
        name,
        phone,
        address,
        category: calcId ?? "general",
        comment,
        consent: true,
        website,
        ...(calcId ? { calc: { id: calcId, answers } } : {}),
      });
      onDone(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить. Попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="calc-form">
      <div className="calc-body">
        {calcId && total !== null ? (
          <div className="calc-mini">
            <span>{CATEGORY_LABELS[calcId]}</span>
            <b>примерно {formatRub(total)}</b>
          </div>
        ) : (
          <p className="calc-lead">Расскажите, что нужно сделать. Перезвоним, уточним детали и назовём цену.</p>
        )}
        <label className="field">
          <span>Как к вам обращаться</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
        </label>
        <label className="field">
          <span>Телефон</span>
          <input
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 (999) 123-45-67"
            value={phone}
            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          />
        </label>
        <label className="field">
          <span>
            Адрес или район <span className="muted">(необязательно)</span>
          </span>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" maxLength={300} placeholder="Например: Москва, Профсоюзная, 12" />
        </label>
        <label className="field">
          <span>
            {calcId ? "Комментарий" : "Что нужно сделать"} {calcId && <span className="muted">(необязательно)</span>}
          </span>
          <textarea
            className="input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            placeholder={calcId ? "Удобное время для звонка, этаж, особенности" : "Например: повесить три полки и люстру"}
          />
        </label>
        <label className="trap" aria-hidden="true">
          Сайт
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            Согласен на обработку персональных данных в соответствии с{" "}
            <Link to="/privacy" target="_blank">
              политикой
            </Link>
          </span>
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="calc-foot">
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Отправляем…" : "Отправить заявку"}
        </button>
      </footer>
    </form>
  );
}

function Done({ number, total, onClose }: { number: string | null; total: number | null; onClose: () => void }) {
  return (
    <>
      <div className="calc-body calc-done">
        <CircleCheck size={44} />
        <h3>Заявка {number} принята</h3>
        {total !== null && <p className="calc-done-sum">Примерно {formatRub(total)}</p>}
        <ol className="calc-next">
          <li>
            <b>Перезвоним в течение 15 минут</b>
            <span>В рабочее время, с 9 до 21. Уточним детали и назовём точную цену.</span>
          </li>
          <li>
            <b>Смета и договор — в личном кабинете</b>
            <span>Согласуете в один клик: вход по номеру телефона и коду.</span>
          </li>
          <li>
            <b>Мастер приедет в согласованное время</b>
            <span>Работаем по договору, гарантия {BRAND.warrantyMonths} месяцев.</span>
          </li>
        </ol>
      </div>
      <footer className="calc-foot">
        <button className="btn btn-primary btn-block" onClick={onClose}>
          Готово
        </button>
      </footer>
    </>
  );
}
