import { BRAND } from "@ks/core";
import { Link } from "react-router";
import { Logo } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <Logo />
          <span>Ремонт и строительные работы. {BRAND.region}.</span>
        </div>
        <ul>
          <li>{BRAND.legalName}</li>
          <li>ОГРНИП {BRAND.ogrnip}</li>
          <li>ИНН {BRAND.inn}</li>
        </ul>
        <ul>
          {BRAND.phone && (
            <li>
              <a href={`tel:${BRAND.phone.replace(/[^\d+]/g, "")}`}>{BRAND.phone}</a>
            </li>
          )}
          {BRAND.email && (
            <li>
              <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
            </li>
          )}
          <li>
            <Link to="/dogovor">Договор подряда</Link>
          </li>
          <li>
            <Link to="/privacy">Политика обработки персональных данных</Link>
          </li>
          <li>
            <Link to="/login">Вход для клиентов и мастеров</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
