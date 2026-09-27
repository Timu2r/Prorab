import { BRAND, CATEGORY_LABELS, formatRub, isCalcId, UNIT_LABELS, type Category, type Unit } from "@ks/core";
import { ArrowRight, Camera, FileText, MapPin, Plus, Receipt, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { LeadDialog, type LeadStart } from "../components/LeadDialog";
import { LeadWays } from "../components/LeadWays";
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
  const [lead, setLead] = useState<LeadStart | null>(null);
  const openCalc = (calc?: Category) => setLead({ way: "full", calc: calc && isCalcId(calc) ? calc : undefined });

  useEffect(() => {
    document.title = `${BRAND.name} — ремонт и строительные работы в Москве и области`;
    api<{ services: Service[] }>("GET", "/services")
      .then((r) => setServices(r.services))
      .catch(() => {}); // без цен страница всё равно работает
    // Ссылки для рекламы и мессенджеров: /?calc=climate — подробная заявка сразу с расчётом направления,
    // /?lead=consult — консультация, /?lead=full — подробная заявка
    const p = new URLSearchParams(location.search);
    const calc = p.get("calc");
    if (calc && isCalcId(calc)) setLead({ way: "full", calc });
    else if (p.get("lead") === "consult") setLead({ way: "consult" });
    else if (p.get("lead") === "full") setLead({ way: "full" });
  }, []);

  // Цена главной работы направления: «Шпаклёвка от 550 ₽/м²». Поштучные позиции — без «/шт».
  const priceFrom = useMemo(() => {
    const byId = new Map(services.map((s) => [s.id, s]));
    const out = new Map<Category, string>();
    for (const d of DIRECTIONS) {
      const s = byId.get(`svc_${d.headline.key}`);
      if (!s || s.price === null) continue;
      const per = s.unit === "pcs" || s.unit === "visit" || s.unit === "point" ? "" : `/${UNIT_LABELS[s.unit]}`;
      out.set(d.category, `${d.headline.label} от ${formatRub(s.price)}${per}`);
    }
    return out;
  }, [services]);

  const tabServices = services.filter((s) => s.category === tab);


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
                <button className="btn btn-primary" onClick={() => openCalc()}>
                  Рассчитать стоимость
                  <ArrowRight size={18} />
                </button>
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
            <LeadWays id="zayavka" title="Оставить заявку" text="Выберите, как удобнее: без регистрации и предоплаты." onOpen={setLead} />
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
                <button key={category} className="direction" onClick={() => openCalc(category)}>
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
                    <span className="direction-go">
                      Рассчитать
                      <ArrowRight size={18} />
                    </span>
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
              <button className="btn btn-outline" onClick={() => openCalc(tab)}>
                Рассчитать стоимость
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
            <LeadWays title="Заявка на ремонт" text="Консультация, подробная заявка с расчётом или звонок — как вам удобнее." onOpen={setLead} />
          </div>
        </section>
      </main>
      <SiteFooter />
      {lead && <LeadDialog start={lead} onClose={() => setLead(null)} />}
    </>
  );
}
