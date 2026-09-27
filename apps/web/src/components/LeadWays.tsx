import { BRAND } from "@ks/core";
import { ClipboardList, Phone, PhoneCall } from "lucide-react";
import "../calculator.css";
import type { LeadStart } from "./LeadDialog";

/**
 * Три способа оставить заявку (решение владельца 2026-09-27): консультация — перезвоним; подробная заявка —
 * что, как и зачем, с расчётом и фото; звонок — сразу по номеру.
 */
export function LeadWays({ id, title, text, onOpen }: { id?: string; title: string; text: string; onOpen: (s: LeadStart) => void }) {
  return (
    <div className="lead-card" id={id}>
      <h2>{title}</h2>
      <p>{text}</p>
      <div className="ways">
        <button className="way" onClick={() => onOpen({ way: "consult" })}>
          <PhoneCall size={22} />
          <span>
            <b>Консультация</b>
            <small>Оставьте телефон — перезвоним за 15 минут, подскажем и сориентируем по цене</small>
          </span>
        </button>
        <button className="way way-main" onClick={() => onOpen({ way: "full" })}>
          <ClipboardList size={22} />
          <span>
            <b>Подробная заявка</b>
            <small>Расскажите, что и как нужно сделать, приложите фото — примерную цену увидите сразу</small>
          </span>
        </button>
        {BRAND.phone && (
          <a className="way" href={`tel:${BRAND.phone.replace(/[^\d+]/g, "")}`}>
            <Phone size={22} />
            <span>
              <b>Позвонить</b>
              <small>
                <strong className="way-phone">{BRAND.phone}</strong> — с 9 до 21, сразу назовём ориентир по цене
              </small>
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
