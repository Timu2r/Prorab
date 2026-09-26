import { CATEGORY_LABELS, formatRub, type Category } from "@ks/core";
import { AirVent, Camera, FileCheck, Fan, Phone, ShieldCheck, Snowflake, Wrench, Zap } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router";
import { api } from "../api";
import { useAuth } from "../auth";

type Service = { id: string; category: Category; name: string; unit: string; price: number | null };

const DIRECTIONS: { category: Category; Icon: ComponentType<{ size?: number }>; items: string[] }[] = [
  { category: "climate", Icon: Snowflake, items: ["Монтаж и демонтаж", "Чистка и ТО", "Заправка фреоном", "Продажа с установкой"] },
  { category: "vent", Icon: Fan, items: ["Вытяжные вентиляторы", "Воздуховоды", "Приточные клапаны"] },
  { category: "electric", Icon: Zap, items: ["Розетки и выключатели", "Автоматы и УЗО", "Линия под кондиционер"] },
  { category: "plumbing", Icon: Wrench, items: ["Смесители и унитазы", "Водонагреватели", "Течи и засоры"] },
];

export function Header() {
  const { user } = useAuth();
  return (
    <header className="top">
      <div className="wrap">
        <Link to="/" className="brand">
          <AirVent size={26} />
          Климат-сервис
        </Link>
        <Link to={user ? "/cabinet" : "/login"} className="btn btn-ghost btn-sm">
          {user ? "Кабинет" : "Войти"}
        </Link>
      </div>
    </header>
  );
}

export function HomePage() {
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    api<{ services: Service[] }>("GET", "/services")
      .then((r) => setServices(r.services))
      .catch(() => {}); // без цен главная всё равно работает
  }, []);

  const priceFrom = (c: Category) => {
    const prices = services.filter((s) => s.category === c && s.price !== null).map((s) => s.price!);
    return prices.length ? `от ${formatRub(Math.min(...prices))}` : null;
  };

  return (
    <>
      <Header />
      <main className="wrap">
        <section className="hero">
          <h1>Кондиционеры, вентиляция, электрика и сантехника в Москве и области</h1>
          <p>Монтаж, обслуживание и ремонт. Цена работ согласуется до выезда, оплата на счёт с чеком, гарантия на работы 12 месяцев.</p>
          <div className="hero-actions">
            <Link to="/login" className="btn btn-primary">
              Оставить заявку
            </Link>
            <a href="#prices" className="btn btn-ghost">
              Услуги и цены
            </a>
          </div>
        </section>

        <section className="section" id="prices">
          <h2>Что делаем</h2>
          <div className="grid">
            {DIRECTIONS.map(({ category, Icon, items }) => (
              <div key={category} className="card direction">
                <div className="icon">
                  <Icon size={22} />
                </div>
                <h3>{CATEGORY_LABELS[category]}</h3>
                <ul>
                  {items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <span className="price-from">{priceFrom(category) ?? "Цена по запросу"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Как работаем</h2>
          <div className="grid">
            <div className="promise">
              <ShieldCheck size={24} />
              <div>
                <b>Гарантия 12 месяцев</b>
                <span className="muted">На все работы. Гарантийный талон на руки.</span>
              </div>
            </div>
            <div className="promise">
              <FileCheck size={24} />
              <div>
                <b>Договор, чек и акт</b>
                <span className="muted">Оплата только на счёт, сначала материалы, работа после выполнения.</span>
              </div>
            </div>
            <div className="promise">
              <Camera size={24} />
              <div>
                <b>Фотоотчёт</b>
                <span className="muted">Мастер фотографирует объект до и после работ.</span>
              </div>
            </div>
            <div className="promise">
              <Phone size={24} />
              <div>
                <b>Перезвоним за 15 минут</b>
                <span className="muted">Уточним задачу и назовём цену до выезда.</span>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="wrap">
          ИП Хамидов Тимур Шокирович, ОГРНИП 326508100468649, ИНН 502759921364
        </div>
      </footer>
    </>
  );
}
