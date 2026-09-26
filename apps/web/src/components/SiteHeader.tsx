import { BRAND, LOGO_WORD } from "@ks/core";
import { Menu, Phone, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth";

/** Трафаретная надпись ПРОРАБ, под ней подпись ровно по ширине слова. Контуры — packages/core/src/logo.ts. */
export function Logo() {
  const { width, height, letters } = LOGO_WORD;
  return (
    <Link to="/" className="logo" aria-label={`${BRAND.name} — на главную`}>
      <svg viewBox={`0 0 ${width} ${height + 20}`} aria-hidden="true">
        {letters.map((d, i) => (
          <path key={i} d={d} className={i === 0 ? "logo-first" : undefined} />
        ))}
        <text x="0" y={height + 19} textLength={width} lengthAdjust="spacing" className="logo-tag">
          {BRAND.tagline.toUpperCase()}
        </text>
      </svg>
    </Link>
  );
}

const NAV = [
  { href: "/#uslugi", label: "Услуги" },
  { href: "/#ceny", label: "Цены" },
  { href: "/#kak-rabotaem", label: "Как работаем" },
  { href: "/#voprosy", label: "Вопросы" },
];

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="wrap bar">
        <Logo />
        <nav className="nav" aria-label="Разделы">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="bar-right">
          {BRAND.phone && (
            <a className="bar-phone" href={`tel:${BRAND.phone.replace(/[^\d+]/g, "")}`}>
              {BRAND.phone}
            </a>
          )}
          <Link className="bar-login" to={user ? "/cabinet" : "/login"}>
            {user ? "Кабинет" : "Войти"}
          </Link>
          <a className="btn btn-primary btn-sm" href="/#zayavka">
            <span className="only-lg">Оставить заявку</span>
            <span className="only-sm">Заявка</span>
          </a>
          {BRAND.phone && (
            <a className="menu-btn" href={`tel:${BRAND.phone.replace(/[^\d+]/g, "")}`} aria-label={`Позвонить ${BRAND.phone}`}>
              <Phone size={19} />
            </a>
          )}
          <button className="menu-btn" aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="mobile-menu" aria-label="Разделы" onClick={() => setOpen(false)}>
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
          <Link to={user ? "/cabinet" : "/login"}>{user ? "Кабинет" : "Войти"}</Link>
        </nav>
      )}
    </header>
  );
}
