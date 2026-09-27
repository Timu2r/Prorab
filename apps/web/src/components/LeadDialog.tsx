import {
  BRAND,
  CALCULATORS,
  CATEGORY_LABELS,
  describeAnswers,
  fieldVisible,
  formatRub,
  normalizeAnswers,
  quote,
  SLOT_LABELS,
  SLOTS,
  UNIT_LABELS,
  type Answers,
  type CalcField,
  type CalcId,
  type Category,
  type ItemKind,
  type PriceItem,
  type Quote,
  type Slot,
} from "@ks/core";
import { ArrowLeft, CircleAlert, CircleCheck, ImagePlus, Info, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiError, uploadImage } from "../api";
import { useAuth } from "../auth";
import "../calculator.css";
import { DIRECTIONS } from "../directions";
import { formatPhoneInput } from "../phone";

/**
 * Окно заявки (решение владельца 2026-09-27, docs/KALKULYATOR.md, раздел 3). Два пути из трёх способов:
 * - консультация — имя и телефон, перезваниваем;
 * - подробная заявка — направление → вопросы → расчёт → пожелания (когда, адрес, своими словами, фото) → контакты.
 * Третий способ — позвонить — просто ссылка с номером (components/LeadWays.tsx).
 */

export type LeadStart = { way: "consult"; category?: Category } | { way: "full"; calc?: CalcId };
type Step = "consult" | "pick" | "questions" | "result" | "details" | "contacts" | "done";

type Wishes = { when: "asap" | "date"; date: string; slot: Slot; address: string; apartment: string; floor: string; text: string };
type Photo = { file: File; url: string };
/** access — ключ браузера из ответа на заявку: с ним «Мои заказы» появляются без входа (docs/TZ.md, 16.4). */
type Sent = { id: string | null; number: string | null; total: number | null; photos: number; failed: number; way: "consult" | "full"; access: string | null };
type LeadResponse = { id?: string; number: string | null; total?: number | null; upload?: { exp: number; sig: string } | null; access?: string | null };

const MAX_PHOTOS = 5;

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

const FULL_STEPS: Step[] = ["pick", "questions", "result", "details", "contacts"];

export function LeadDialog({ start, onClose }: { start: LeadStart; onClose: () => void }) {
  const [calcId, setCalcId] = useState<CalcId | null>(start.way === "full" ? (start.calc ?? null) : null);
  const [step, setStep] = useState<Step>(start.way === "consult" ? "consult" : start.calc ? "questions" : "pick");
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [prices, setPrices] = useState<Map<string, PriceItem> | null>(null);
  const [pricesError, setPricesError] = useState("");
  const [wishes, setWishes] = useState<Wishes>({ when: "asap", date: "", slot: "", address: "", apartment: "", floor: "", text: "" });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sent, setSent] = useState<Sent | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const { adopt } = useAuth();

  const calc = calcId ? CALCULATORS[calcId] : null;
  const answers = useMemo(() => (calc ? normalizeAnswers(calc, raw) : {}), [calc, raw]);
  const q = useMemo(() => (calcId && prices ? quote(calcId, answers, prices) : null), [calcId, answers, prices]);

  useEffect(() => {
    if (start.way !== "full") return;
    loadPrices()
      .then(setPrices)
      .catch(() => setPricesError("Не удалось загрузить цены. Заявку всё равно можно отправить — посчитаем при звонке."));
  }, [start.way]);

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

  // Превью фото освобождаем, когда окно закрыто (убранное фото освобождается сразу в Details)
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  useEffect(() => {
    dialog.current?.querySelector(".calc-body")?.scrollTo({ top: 0 });
    dialog.current?.focus();
  }, [step]);

  const finish = (r: Sent) => {
    // Браузер без ключа получил новый — в шапке сразу появляется «Мои заказы»
    if (r.access) void adopt(r.access);
    setSent(r);
    setStep("done");
  };

  const choose = (id: CalcId) => {
    if (id !== calcId) setRaw({});
    setCalcId(id);
    setStep("questions");
  };

  const idx = FULL_STEPS.indexOf(step);
  const back = idx > 0 ? () => setStep(FULL_STEPS[idx - 1]!) : null;
  const title =
    step === "consult"
      ? "Консультация"
      : step === "pick"
        ? "Что нужно сделать?"
        : step === "details"
          ? "Пожелания"
          : step === "contacts"
            ? "Куда перезвонить"
            : step === "done"
              ? "Заявка принята"
              : (calc?.title ?? "Подробная заявка");

  return (
    <div className="calc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="calc-dialog" role="dialog" aria-modal="true" aria-labelledby="calc-title" tabIndex={-1} ref={dialog}>
        <header className="calc-head">
          {back ? (
            <button className="icon-btn" onClick={back} aria-label="Назад">
              <ArrowLeft size={20} />
            </button>
          ) : (
            <span />
          )}
          <div className="calc-head-title">
            {idx >= 0 && (
              <small>
                Шаг {idx + 1} из {FULL_STEPS.length}
              </small>
            )}
            <h2 id="calc-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        {step === "consult" && <Consult start={start.way === "consult" ? start.category : undefined} onSent={finish} />}
        {step === "pick" && <Pick onChoose={choose} />}
        {step === "questions" && calc && (
          <Questions
            fields={calc.fields}
            intro={calc.intro}
            answers={answers}
            onChange={(id, v) => setRaw((r) => ({ ...normalizeAnswers(calc, r), [id]: v }))}
            q={q}
            pricesError={pricesError}
            onNext={() => setStep(q ? "result" : "details")}
          />
        )}
        {step === "result" && calc && q && <Result q={q} answersText={describeAnswers(calc, answers)} onAgree={() => setStep("details")} onEdit={() => setStep("questions")} />}
        {step === "details" && <Details wishes={wishes} onWishes={setWishes} photos={photos} onPhotos={setPhotos} onNext={() => setStep("contacts")} />}
        {step === "contacts" && calcId && (
          <FullContacts calcId={calcId} answers={answers} total={q?.totals.total ?? null} wishes={wishes} photos={photos} onSent={finish} />
        )}
        {step === "done" && sent && <Done sent={sent} onClose={onClose} />}
      </div>
    </div>
  );
}

/* ---------- Консультация ---------- */

function Consult({ start, onSent }: { start?: Category; onSent: (r: Sent) => void }) {
  const [category, setCategory] = useState<Category | "">(start ?? "");
  const [comment, setComment] = useState("");
  return (
    <ContactForm
      intro="Оставьте телефон — перезвоним в течение 15 минут в рабочее время, подскажем и сориентируем по цене. Заполнять ничего не нужно."
      extra={
        <>
          <fieldset className="calc-field">
            <legend>
              Что нужно <span className="muted">(необязательно)</span>
            </legend>
            <div className="chips">
              {DIRECTIONS.map(({ category: c }) => (
                <button type="button" key={c} className={`chip${category === c ? " on" : ""}`} onClick={() => setCategory(category === c ? "" : c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>
              Коротко о задаче <span className="muted">(необязательно)</span>
            </span>
            <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Например: не работает кондиционер, нужна консультация по ремонту ванной" />
          </label>
        </>
      }
      button="Жду звонка"
      submit={async (c) => {
        const r = await api<LeadResponse>("POST", "/public/leads", { ...c, type: "consult", category: category || "general", comment, consent: true });
        onSent({ id: r.id ?? null, number: r.number, total: null, photos: 0, failed: 0, way: "consult", access: r.access ?? null });
      }}
    />
  );
}

/** Имя, телефон, согласие и ловушка для ботов — общее для обоих путей. */
function ContactForm({
  intro,
  extra,
  button,
  submit,
  summary,
}: {
  intro?: string;
  extra?: ReactNode;
  button: string;
  summary?: ReactNode;
  submit: (c: { name: string; phone: string; website: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) return setError("Как к вам обращаться?");
    if (phone.replace(/\D/g, "").length < 11) return setError("Введите телефон полностью");
    if (!consent) return setError("Отметьте согласие на обработку персональных данных");
    setBusy(true);
    try {
      await submit({ name, phone, website });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить. Попробуйте ещё раз или позвоните нам");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="calc-form">
      <div className="calc-body">
        {summary}
        {intro && <p className="calc-lead">{intro}</p>}
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
        {extra}
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
          {busy ? "Отправляем…" : button}
        </button>
      </footer>
    </form>
  );
}

/* ---------- Подробная заявка: направление, вопросы, расчёт ---------- */

function Pick({ onChoose }: { onChoose: (id: CalcId) => void }) {
  return (
    <div className="calc-body">
      <p className="calc-lead">Выберите направление. Ответьте на несколько вопросов — примерную цену увидите сразу.</p>
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
      {pricesError && <div className="calc-inline-error">{pricesError}</div>}
      <footer className="calc-foot">
        <div className="calc-total">
          <small>Примерно</small>
          <b>{pricesError ? "—" : q ? formatRub(q.totals.total) : "считаем…"}</b>
        </div>
        <button className="btn btn-primary" onClick={onNext} disabled={!!warn || (!pricesError && (!q || q.lines.length === 0))}>
          {pricesError ? "Дальше" : "Посмотреть расчёт"}
        </button>
      </footer>
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
const subtotal = (q: Quote, k: ItemKind) => (k === "work" ? q.totals.work : k === "material" ? q.totals.materials : q.totals.equipment);

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
          Согласен, продолжить
        </button>
      </footer>
    </>
  );
}

/* ---------- Подробная заявка: пожелания и фото ---------- */

const todayIso = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

function Details({
  wishes,
  onWishes,
  photos,
  onPhotos,
  onNext,
}: {
  wishes: Wishes;
  onWishes: (w: Wishes) => void;
  photos: Photo[];
  onPhotos: (p: Photo[]) => void;
  onNext: () => void;
}) {
  const set = (p: Partial<Wishes>) => onWishes({ ...wishes, ...p });
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const add = (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - photos.length;
    if (list.length > room) setError(`Можно приложить не больше ${MAX_PHOTOS} фото`);
    else setError("");
    onPhotos([...photos, ...list.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const next = () => {
    if (wishes.when === "date" && !wishes.date) return setError("Выберите дату или отметьте «Как можно скорее»");
    setError("");
    onNext();
  };

  return (
    <>
      <div className="calc-body">
        <p className="calc-lead">Всё необязательно, но с этим мы точнее посчитаем и быстрее приедем.</p>

        <fieldset className="calc-field">
          <legend>Когда удобно</legend>
          <div className="chips">
            <button type="button" className={`chip${wishes.when === "asap" ? " on" : ""}`} onClick={() => set({ when: "asap", date: "" })}>
              Как можно скорее
            </button>
            <button type="button" className={`chip${wishes.when === "date" ? " on" : ""}`} onClick={() => set({ when: "date" })}>
              Выбрать дату
            </button>
          </div>
          {wishes.when === "date" && <input className="input calc-date" type="date" min={todayIso()} value={wishes.date} onChange={(e) => set({ date: e.target.value })} />}
          <div className="chips">
            {SLOTS.map((s) => (
              <button type="button" key={s} className={`chip${wishes.slot === s ? " on" : ""}`} onClick={() => set({ slot: s })}>
                {SLOT_LABELS[s]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="calc-field">
          <legend>Адрес</legend>
          <input className="input" value={wishes.address} onChange={(e) => set({ address: e.target.value })} autoComplete="street-address" maxLength={300} placeholder="Город, улица, дом" />
          <div className="calc-row2">
            <input className="input" value={wishes.apartment} onChange={(e) => set({ apartment: e.target.value })} maxLength={20} placeholder="Квартира или офис" aria-label="Квартира или офис" />
            <input className="input" value={wishes.floor} onChange={(e) => set({ floor: e.target.value })} maxLength={20} placeholder="Этаж" aria-label="Этаж" />
          </div>
        </fieldset>

        <label className="field">
          <span>Опишите своими словами</span>
          <textarea
            className="input"
            value={wishes.text}
            onChange={(e) => set({ text: e.target.value })}
            maxLength={1000}
            placeholder="Что нужно сделать и зачем. Например: кондиционер в спальню над окном, наружный блок на балконе, делаем ремонт — трассу спрятать в стену"
          />
        </label>

        <fieldset className="calc-field">
          <legend>
            Фото объекта <span className="muted">(до {MAX_PHOTOS})</span>
          </legend>
          <p className="calc-hint">Место установки, стены, щиток, проблемное место — по фото посчитаем точнее.</p>
          <div className="photos">
            {photos.map((p, i) => (
              <div key={p.url} className="photo">
                <img src={p.url} alt={`Фото ${i + 1}`} />
                <button
                  type="button"
                  aria-label={`Убрать фото ${i + 1}`}
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    onPhotos(photos.filter((x) => x !== p));
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className="photo-add" onClick={() => input.current?.click()}>
                <ImagePlus size={24} />
                <span>Добавить</span>
              </button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </fieldset>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      <footer className="calc-foot">
        <button className="btn btn-primary btn-block" onClick={next}>
          Дальше
        </button>
      </footer>
    </>
  );
}

/** Фото уменьшаем до 1600 px в браузере: быстрее грузится по мобильному интернету, метаданные (геометки) не уходят. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Не удалось обработать фото"))), "image/jpeg", 0.85));
}

function FullContacts({
  calcId,
  answers,
  total,
  wishes,
  photos,
  onSent,
}: {
  calcId: CalcId;
  answers: Answers;
  total: number | null;
  wishes: Wishes;
  photos: Photo[];
  onSent: (r: Sent) => void;
}) {
  const [progress, setProgress] = useState("");
  return (
    <ContactForm
      summary={
        <div className="calc-mini">
          <span>
            {CATEGORY_LABELS[calcId]}
            {photos.length ? ` · фото: ${photos.length}` : ""}
          </span>
          {total !== null && <b>примерно {formatRub(total)}</b>}
        </div>
      }
      extra={progress ? <p className="calc-small">{progress}</p> : undefined}
      button="Отправить заявку"
      submit={async (c) => {
        const r = await api<LeadResponse>("POST", "/public/leads", {
          ...c,
          type: "full",
          category: calcId,
          comment: wishes.text,
          address: wishes.address,
          apartment: wishes.apartment,
          floor: wishes.floor,
          wantedDate: wishes.when === "date" && wishes.date ? wishes.date : null,
          wantedSlot: wishes.slot,
          consent: true,
          calc: { id: calcId, answers },
        });
        let ok = 0;
        let failed = 0;
        for (const [i, p] of photos.entries()) {
          if (!r.upload || !r.id) break;
          setProgress(`Загружаем фото ${i + 1} из ${photos.length}…`);
          try {
            await uploadImage(`/public/leads/${r.id}/photos?exp=${r.upload.exp}&sig=${encodeURIComponent(r.upload.sig)}`, await shrink(p.file));
            ok++;
          } catch {
            failed++;
          }
        }
        onSent({ id: r.id ?? null, number: r.number, total: r.total ?? null, photos: ok, failed, way: "full", access: r.access ?? null });
      }}
    />
  );
}

/* ---------- Готово ---------- */

function Done({ sent, onClose }: { sent: Sent; onClose: () => void }) {
  const full = sent.way === "full";
  const navigate = useNavigate();
  const { loading } = useAuth();
  return (
    <>
      <div className="calc-body calc-done">
        <CircleCheck size={44} />
        <h3>{full ? `Заявка ${sent.number} принята` : "Ждите звонка"}</h3>
        {full && sent.total !== null && <p className="calc-done-sum">Примерно {formatRub(sent.total)}</p>}
        {full && sent.photos > 0 && <p className="calc-small">Фото приложены: {sent.photos}.</p>}
        {sent.failed > 0 && (
          <div className="calc-note warn">
            <CircleAlert size={18} />
            <span>Не все фото загрузились ({sent.failed}). Пришлите их нам в мессенджер после звонка.</span>
          </div>
        )}
        <ol className="calc-next">
          <li>
            <b>Перезвоним в течение 15 минут</b>
            <span>{full ? "В рабочее время, с 9 до 21. Уточним детали и назовём точную цену." : `В рабочее время, с 9 до 21. Заявка ${sent.number}.`}</span>
          </li>
          <li>
            <b>Ход заказа — в «Мои заказы»</b>
            <span>Кнопка уже появилась вверху сайта, входить не нужно. Смету согласуете по коду из звонка — это ваша подпись.</span>
          </li>
          <li>
            <b>Мастер приедет в согласованное время</b>
            <span>Работаем по договору, гарантия {BRAND.warrantyMonths} месяцев.</span>
          </li>
        </ol>
      </div>
      <footer className="calc-foot calc-foot-stack">
        {sent.id ? (
          <>
            <button
              className="btn btn-primary"
              disabled={loading}
              onClick={() => {
                onClose();
                navigate(`/cabinet/z/${sent.id}`);
              }}
            >
              Открыть заказ
            </button>
            <button className="btn btn-outline" onClick={onClose}>
              Закрыть
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-block" onClick={onClose}>
            Готово
          </button>
        )}
      </footer>
    </>
  );
}
