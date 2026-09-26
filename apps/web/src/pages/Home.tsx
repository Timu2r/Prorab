import { BRAND, CATEGORY_LABELS, formatRub, UNIT_LABELS, type Category, type Unit } from "@ks/core";
import { ArrowRight, Camera, FileText, MapPin, Plus, Receipt, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { LeadForm } from "../components/LeadForm";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { DIRECTIONS } from "../directions";

type Service = { id: string; category: Category; name: string; unit: Unit; price: number | null };

const STEPS = [
  { title: "Заявка", text: "На сайте, в приложении или по телефону. Перезваниваем и уточняем задачу." },
  { title: "Осмотр и смета", text: "Мастер осматривает объект. Вы получаете смету с ценой каждой работы." },
  { title: "Договор и материалы", text: "Подписываем договор. Материалы и оборудование оплачиваются по счёту, с чеком." },
  { title: "Работы", text: "Выполняем в согласованные сроки и присылаем фото по этапам." },
  { title: "Приёмка и гарантия", text: "Подписываете акт, оплачиваете работы и получаете гарантийный талон." },
];

const TERMS = [
  { Icon: FileText, title: "Договор на каждый объект", text: "Сроки, состав работ и цена записаны в договоре и смете." },
  { Icon: Wallet, title: "Цена фиксируется до начала", text: "Дополнительные работы только после вашего согласия." },
  { Icon: Receipt, title: "Оплата на счёт, чек на каждую оплату", text: "Материалы по счёту заранее, работы после приёмки." },
  { Icon: ShieldCheck, title: `Гарантия ${BRAND.warrantyMonths} месяцев`, text: "На выполненные работы, с гарантийным талоном." },
  { Icon: Camera, title: "Фото до и после", text: "Фиксируем состояние объекта и результат каждого этапа." },
  { Icon: Trash2, title: "Убираем за собой", text: "После работ собираем мусор и упаковку, оставляем объект чистым." },
];

const FAQ = [
  {
    q: "Сколько стоит ремонт?",
    a: "Зависит от объёма и материалов. Ориентир — в ценах выше, точная сумма — в смете после осмотра объекта. Цена работ фиксируется в договоре.",
  },
  {
    q: "Как проходит оплата?",
    a: "Материалы и оборудование оплачиваются по счёту до начала работ, сами работы — после приёмки по акту. Оплата только на счёт ИП, на каждую оплату выдаём кассовый чек.",
  },
  {
    q: "Какая гарантия?",
    a: `${BRAND.warrantyMonths} месяцев на выполненные работы. На оборудование и материалы действует гарантия производителя.`,
  },
  { q: "Где вы работаете?", a: `${BRAND.region}.` },
  {
    q: "Можно купить кондиционер у вас?",
    a: "Да. Подберём модель под помещение, привезём и установим. Кондиционер и монтаж оформляются одним договором.",
  },
];

export function HomePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [tab, setTab] = useState<Category>("turnkey");
  const [formCategory, setFormCategory] = useState<Category | "">("");

  useEffect(() => {
    document.title = `${BRAND.name} — ремонт и строительные работы в Москве и области`;
    api<{ services: Service[] }>("GET", "/services")
      .then((r) => setServices(r.services))
      .catch(() => {}); // без цен страница всё равно работает
  }, []);

  // «от N ₽/м²» — самая низкая заданная цена в направлении
  const priceFrom = useMemo(() => {
    const min = new Map<Category, Service>();
    for (const s of services) {
      if (s.price === null) continue;
      const cur = min.get(s.category);
      if (!cur || s.price < cur.price!) min.set(s.category, s);
    }
    return new Map([...min].map(([c, s]) => [c, `от ${formatRub(s.price!)}/${UNIT_LABELS[s.unit]}`]));
  }, [services]);

  const tabServices = services.filter((s) => s.category === tab);

  const openPrices = (c: Category) => {
    setTab(c);
    document.getElementById("ceny")?.scrollIntoView();
  };
  const orderFor = (c: Category) => {
    setFormCategory(c);
    document.getElementById("zayavka")?.scrollIntoView();
  };

  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="wrap">
            <div>
              <span className="hero-region">
                <MapPin size={18} />
                {BRAND.region}
              </span>
              <h1>
                Ремонт и строительные работы <em>под ключ</em>
              </h1>
              <p className="hero-lead">
                Отделка, фасады, полы и плитка, электрика, сантехника, кондиционеры и вентиляция. Работаем по договору: смета до начала работ, оплата на счёт с
                чеком, гарантия {BRAND.warrantyMonths} месяцев.
              </p>
              <div className="hero-actions">
                <a href="#zayavka" className="btn btn-primary">
                  Рассчитать стоимость
                  <ArrowRight size={18} />
                </a>
                <a href="#ceny" className="btn btn-outline-light">
                  Цены на работы
                </a>
              </div>
              <div className="facts">
                <div>
                  <b>{BRAND.warrantyMonths} мес.</b>
                  <span>гарантия на работы</span>
                </div>
                <div>
                  <b>Договор</b>
                  <span>и смета до начала</span>
                </div>
                <div>
                  <b>Чек</b>
                  <span>на каждую оплату</span>
                </div>
                <div>
                  <b>Фото</b>
                  <span>до и после работ</span>
                </div>
              </div>
            </div>
            <LeadForm id="zayavka" title="Расчёт стоимости" category={formCategory} onCategory={setFormCategory} />
          </div>
        </section>

        <section className="section" id="uslugi">
          <div className="wrap">
            <div className="section-head">
              <h2>Направления работ</h2>
              <p>Берём как отдельные работы, так и ремонт под ключ: от одной розетки до фасада дома.</p>
            </div>
            <div className="directions">
              {DIRECTIONS.map(({ category, Icon, works }, i) => (
                <button key={category} className="direction" onClick={() => openPrices(category)}>
                  <span className="direction-top">
                    {String(i + 1).padStart(2, "0")}
                    <Icon size={22} />
                  </span>
                  <h3>{CATEGORY_LABELS[category]}</h3>
                  <ul>
                    {works.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <span className="direction-price">
                    {priceFrom.get(category) ?? "Цена по смете"}
                    <ArrowRight size={18} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-alt" id="ceny">
          <div className="wrap">
            <div className="section-head">
              <h2>Цены на работы</h2>
              <p>Цена указана за работу, без материалов. Точная стоимость — в смете после осмотра объекта.</p>
            </div>
            <div className="tabs" role="tablist" aria-label="Направления">
              {DIRECTIONS.map(({ category }) => (
                <button key={category} role="tab" aria-selected={tab === category} className="tab" onClick={() => setTab(category)}>
                  {CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
            <div className="price-table" role="tabpanel">
              {tabServices.length === 0 && <div className="price-row muted">Загрузка цен…</div>}
              {tabServices.map((s) => (
                <div key={s.id} className="price-row">
                  <span>{s.name}</span>
                  <span className="unit">за {UNIT_LABELS[s.unit]}</span>
                  <span className="price">{s.price === null ? "по смете" : `от ${formatRub(s.price)}`}</span>
                </div>
              ))}
            </div>
            <div className="price-note">
              <p>Материалы закупаем по счёту заранее, работы оплачиваются после приёмки. На каждую оплату — кассовый чек.</p>
              <button className="btn btn-outline" onClick={() => orderFor(tab)}>
                Получить смету
              </button>
            </div>
          </div>
        </section>

        <section className="section" id="kak-rabotaem">
          <div className="wrap">
            <div className="section-head">
              <h2>Как работаем</h2>
              <p>Каждый шаг фиксируется документом: смета, договор, чек, акт, гарантийный талон.</p>
            </div>
            <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {STEPS.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section section-alt" id="usloviya">
          <div className="wrap">
            <div className="section-head">
              <h2>Условия работы</h2>
              <p>Прозрачно по деньгам и документам — чтобы не было сюрпризов ни в смете, ни после сдачи.</p>
            </div>
            <div className="terms">
              {TERMS.map(({ Icon, title, text }) => (
                <div key={title} className="term">
                  <Icon size={22} />
                  <div>
                    <b>{title}</b>
                    <span>{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="voprosy">
          <div className="wrap">
            <div className="section-head">
              <h2>Вопросы</h2>
            </div>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <Plus size={22} />
                  </summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta">
          <div className="wrap">
            <div className="cta-text">
              <h2>Расскажите, что нужно сделать</h2>
              <p>Перезвоним, договоримся об осмотре и подготовим смету.</p>
            </div>
            <LeadForm title="Заявка на ремонт" category="" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
