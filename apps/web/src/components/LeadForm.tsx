import { CATEGORY_LABELS, CATEGORIES, type Category } from "@ks/core";
import { CircleCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../api";

/** +7 (999) 123-45-67 по мере ввода. Хранится то, что видит человек; сервер сам приводит номер к виду +79991234567. */
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

export function LeadForm({ id, title, category, onCategory }: { id?: string; title: string; category: Category | ""; onCategory?: (c: Category | "") => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cat, setCat] = useState<Category | "">(category);
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  // Выбор направления на странице (кнопка «Цены» у карточки) подставляется в форму
  const selected = onCategory ? category : cat;
  const choose = (c: Category | "") => (onCategory ? onCategory(c) : setCat(c));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consent) return setError("Отметьте согласие на обработку персональных данных");
    setBusy(true);
    try {
      const r = await api<{ number: string | null }>("POST", "/public/leads", {
        name,
        phone,
        category: selected || "general",
        comment,
        consent: true,
        website,
      });
      setDone(r.number ?? "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить. Попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };

  if (done !== null)
    return (
      <div className="lead-card" id={id}>
        <div className="lead-done" role="status">
          <CircleCheck size={40} />
          <b>Заявка {done} принята</b>
          <span className="muted">Перезвоним на {phone}, уточним задачу и договоримся об осмотре.</span>
        </div>
      </div>
    );

  return (
    <form className="lead-card" id={id} onSubmit={submit} noValidate>
      <h2>{title}</h2>
      <p>Опишите задачу. Перезвоним, уточним детали и назовём стоимость.</p>
      <label className="field">
        <span>Как к вам обращаться</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
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
          required
        />
      </label>
      <label className="field">
        <span>Что нужно</span>
        <select className="input" value={selected} onChange={(e) => choose(e.target.value as Category | "")}>
          <option value="">Выберите направление</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>
          Коротко о задаче <span className="muted" style={{ fontWeight: 500 }}>(необязательно)</span>
        </span>
        <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Например: шпаклёвка и покраска стен, 2 комнаты, около 60 м²" />
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
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? "Отправляем…" : "Отправить заявку"}
      </button>
    </form>
  );
}
