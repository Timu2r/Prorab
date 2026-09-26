import { BRAND } from "@ks/core";
import { Menu, Phone, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label={`${BRAND.name} — на главную`}>
      {/* Знак — строительный отвес: нить и груз */}
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="4" fill="var(--accent)" />
        <path d="M16 5v8" stroke="#fff" strokeWidth="2" />
        <path d="M11 13h10l-5 13z" fill="#fff" />
      </svg>
      <span>
        {BRAND.name}
        <small>{BRAND.tagline}</small>
      </span>
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
