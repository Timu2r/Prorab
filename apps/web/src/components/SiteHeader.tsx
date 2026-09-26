import { BRAND } from "@ks/core";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label={`${BRAND.name} — на главную`}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="4" fill="var(--accent)" />
        <path d="M9 24V9h14v15" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="miter" />
        <path d="M9 16h14" stroke="#fff" strokeWidth="2" strokeOpacity="0.55" />
      </svg>
      <span>
        {BRAND.name}
        <small>ремонт и стройка</small>
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
