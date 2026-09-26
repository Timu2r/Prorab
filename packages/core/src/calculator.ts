import { estimateTotals, type EstimateTotals, type ItemKind } from "./estimate";
import { lineTotal, type Kopecks } from "./money";
import type { Category, Unit } from "./services";

/**
 * Калькулятор примерной стоимости на сайте (docs/KALKULYATOR.md). Вопросы и правила расчёта — здесь, в ядре:
 * сайт считает сразу, пока клиент отвечает, а сервер пересчитывает те же ответы по ценам из базы и кладёт
 * результат в черновик сметы. Цены берутся из прайса: поменяли цену в прайсе — поменялся калькулятор.
 */

export type CalcId = Exclude<Category, "general">;

type Base = {
  id: string;
  label: string;
  hint?: string;
  /** Вопрос показывается, только если ответ на другой вопрос — один из перечисленных. */
  when?: { field: string; is: readonly (string | boolean)[] };
};

export type CalcField =
  | (Base & { type: "choice"; options: readonly { value: string; label: string; hint?: string }[]; default: string })
  | (Base & { type: "count"; min: number; max: number; default: number })
  | (Base & { type: "size"; unit: "м" | "м²"; min: number; max: number; default: number })
  | (Base & { type: "toggle"; default: boolean });

export type Answers = Record<string, string | number | boolean>;

export type CalcNote = { tone: "warn" | "info"; text: string };

/** Строка расчёта: позиция прайса и количество. Название, единица и цена берутся из прайса. */
export type CalcLineRef = { key: string; qty: number };

export type CalcOutput = { lines: CalcLineRef[]; notes: CalcNote[]; reservePercent: number };

export type Calculator = {
  id: CalcId;
  title: string;
  intro: string;
  fields: readonly CalcField[];
  compute(a: Answers): CalcOutput;
};

/** Кондиционеры: правила владельца (2026-09-26). */
export const AC_ROUTE_RESERVE_M = 5; // запас к замеру клиента
export const AC_ROUTE_MAX_M = 25; // трасса, если клиент не знает длину: считаем по максимуму
export const AC_STANDARD_ROUTE_M = 3; // трасса, которая входит в стандартный монтаж
const AC_LINE_CABLE_M = 15; // кабель отдельной линии от щитка
const WALLS_PER_FLOOR = 2.7; // площадь стен ≈ площадь пола × 2,7 (потолок 2,7 м, за вычетом окон и дверей)

const str = (a: Answers, id: string) => String(a[id] ?? "");
const num = (a: Answers, id: string) => Number(a[id] ?? 0);
const bool = (a: Answers, id: string) => a[id] === true;
const round1 = (n: number) => Math.round(n * 10) / 10;

function collector() {
  const lines: CalcLineRef[] = [];
  const notes: CalcNote[] = [];
  return {
    lines,
    notes,
    add(key: string, qty: number) {
      const q = round1(qty);
      if (q > 0) lines.push({ key, qty: q });
    },
    warn(text: string) {
      notes.push({ tone: "warn", text });
    },
    info(text: string) {
      notes.push({ tone: "info", text });
    },
  };
}

const MATERIALS_CHOICE = (who: string) =>
  ({
    id: "materials",
    type: "choice",
    label: "Материалы",
    options: [
      { value: "we", label: `${who} закупаем мы`, hint: "По счёту до начала работ, с чеком" },
      { value: "client", label: "Покупаю сам" },
    ],
    default: "we",
  }) as const satisfies CalcField;

const climate: Calculator = {
  id: "climate",
  title: "Кондиционеры",
  intro: "Монтаж, чистка, ремонт. Кондиционер можем подобрать и привезти.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Что нужно",
      options: [
        { value: "install", label: "Установить кондиционер" },
        { value: "service", label: "Чистка и обслуживание" },
        { value: "repair", label: "Не работает: диагностика и ремонт" },
        { value: "dismount", label: "Снять или перенести" },
      ],
      default: "install",
    },
    { id: "small", type: "count", label: "Кондиционеры для комнат до 35 м²", hint: "Мощность 7–12, до 3,5 кВт", min: 0, max: 10, default: 1, when: { field: "job", is: ["install"] } },
    { id: "large", type: "count", label: "Для комнат 35–70 м²", hint: "Мощность 18–24, 5–7 кВт", min: 0, max: 10, default: 0, when: { field: "job", is: ["install"] } },
    {
      id: "unit",
      type: "choice",
      label: "Кондиционер",
      options: [
        { value: "have", label: "Уже есть" },
        { value: "need", label: "Нужен: подберите и привезите" },
      ],
      default: "have",
      when: { field: "job", is: ["install"] },
    },
    {
      id: "route",
      type: "choice",
      label: "Длина трассы между блоками",
      hint: "Трасса — медные трубы и кабель от внутреннего блока до наружного",
      options: [
        { value: "unknown", label: "Не знаю — посчитайте по максимуму", hint: `${AC_ROUTE_MAX_M} м на кондиционер. Мастер измерит, обычно выходит меньше` },
        { value: "known", label: "Знаю длину", hint: `К вашему замеру добавим ${AC_ROUTE_RESERVE_M} м запаса` },
      ],
      default: "unknown",
      when: { field: "job", is: ["install"] },
    },
    {
      id: "length",
      type: "size",
      unit: "м",
      label: "Длина трассы на один кондиционер",
      hint: "Если блоки по разные стороны одной стены — около 1–3 м",
      min: 1,
      max: 40,
      default: 5,
      when: { field: "route", is: ["known"] },
    },
    { id: "duct", type: "toggle", label: "Закрыть трассу декоративным коробом", default: false, when: { field: "job", is: ["install"] } },
    { id: "chase", type: "toggle", label: "Спрятать трассу в стену (ремонт ещё идёт)", default: false, when: { field: "job", is: ["install"] } },
    {
      id: "pump",
      type: "toggle",
      label: "Нужна дренажная помпа",
      hint: "Если конденсат нельзя отвести самотёком на улицу или в канализацию",
      default: false,
      when: { field: "job", is: ["install"] },
    },
    { id: "height", type: "toggle", label: "Наружный блок на фасаде выше 2 этажа, без балкона", default: false, when: { field: "job", is: ["install"] } },
    {
      id: "line",
      type: "toggle",
      label: "Отдельная электролиния от щитка",
      hint: "Обязательна для мощных кондиционеров 18–24 и если рядом нет розетки",
      default: false,
      when: { field: "job", is: ["install"] },
    },
    { id: "dismount", type: "count", label: "Снять старые кондиционеры", min: 0, max: 10, default: 0, when: { field: "job", is: ["install"] } },
    { id: "count", type: "count", label: "Сколько кондиционеров", min: 1, max: 10, default: 1, when: { field: "job", is: ["service", "dismount"] } },
    { id: "freon", type: "toggle", label: "Нужна дозаправка фреоном", default: false, when: { field: "job", is: ["service"] } },
    { id: "move", type: "toggle", label: "Перенести на новое место", hint: "Снимем и установим заново", default: false, when: { field: "job", is: ["dismount"] } },
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    if (job === "service") {
      const n = num(a, "count");
      c.add("climate-service", n);
      if (bool(a, "freon")) c.add("climate-freon", n);
      c.info("Чистка внутреннего и наружного блоков, проверка давления и работы во всех режимах.");
      return { ...c, reservePercent: 0 };
    }
    if (job === "repair") {
      c.add("climate-diagnostics", 1);
      c.info("Стоимость ремонта назовём после диагностики: от неё зависит, что менять.");
      return { ...c, reservePercent: 0 };
    }
    if (job === "dismount") {
      const n = num(a, "count");
      c.add(bool(a, "move") ? "climate-move" : "climate-dismount", n);
      if (bool(a, "move")) c.info(`В перенос входит трасса до ${AC_STANDARD_ROUTE_M} м. Если на новом месте трасса длиннее — доплата за метры по прайсу.`);
      return { ...c, reservePercent: 0 };
    }

    const small = num(a, "small");
    const large = num(a, "large");
    const n = small + large;
    if (n === 0) {
      c.warn("Укажите, сколько кондиционеров установить.");
      return { ...c, reservePercent: 0 };
    }
    const known = str(a, "route") === "known";
    const route = known ? num(a, "length") + AC_ROUTE_RESERVE_M : AC_ROUTE_MAX_M;

    c.add("climate-mount-small", small);
    c.add("climate-mount-large", large);
    c.add("climate-extra-pipe", n * Math.max(route - AC_STANDARD_ROUTE_M, 0));
    // Две медные трубы на всю трассу: жидкостная 1/4″ и газовая 3/8″ (у мощных — 1/2″)
    c.add("mat-copper-14", n * route);
    c.add("mat-copper-38", small * route);
    c.add("mat-copper-12", large * route);
    c.add("mat-insulation", 2 * n * route);
    c.add("mat-ac-cable", n * (route + 1));
    c.add("mat-drain-hose", n * route);
    c.add("mat-ac-brackets", n);
    c.add("mat-ac-kit", n);
    if (bool(a, "chase")) c.add("climate-chase", n * route);
    else if (bool(a, "duct")) {
      c.add("climate-duct", n * route);
      c.add("mat-ac-duct", n * route);
    }
    if (bool(a, "pump")) {
      c.add("climate-pump", n);
      c.add("mat-drain-pump", n);
    }
    if (bool(a, "height")) c.add("general-height", n);
    if (bool(a, "line")) {
      c.add("electric-ac-line", n);
      c.add("mat-power-cable", n * AC_LINE_CABLE_M);
      c.add("mat-breaker", n);
    }
    c.add("climate-dismount", num(a, "dismount"));
    if (str(a, "unit") === "need") {
      c.add("eq-split-small", small);
      c.add("eq-split-large", large);
    }

    if (known)
      c.warn(
        `Трасса посчитана по вашему замеру: ${num(a, "length")} м + ${AC_ROUTE_RESERVE_M} м запаса = ${route} м на кондиционер. ` +
          "Если из-за неточного замера трассы не хватит, дополнительные метры и материалы оплачиваются отдельно по прайсу.",
      );
    else
      c.info(
        `Длину трассы посчитали по максимуму: ${AC_ROUTE_MAX_M} м на кондиционер, это ${2 * AC_ROUTE_MAX_M} м медной трубы. ` +
          "Мастер измерит точно; обычно трасса короче, и цена снижается.",
      );
    c.info(`Стандартный монтаж: трасса до ${AC_STANDARD_ROUTE_M} м, отверстие в стене, вакуумирование и пуск.`);
    if (str(a, "unit") === "need") c.info("Цена кондиционера — ориентир для недорогой инверторной модели. Подберём модель под комнату и бюджет.");
    if (bool(a, "height")) c.warn("Выше 2 этажа без балкона может понадобиться альпинист — уточним при звонке.");
    c.info("В многоквартирном доме место наружного блока иногда согласуют с управляющей компанией.");
    return { ...c, reservePercent: 0 };
  },
};

const vent: Calculator = {
  id: "vent",
  title: "Вентиляция",
  intro: "Вытяжка в санузле и на кухне, приточные клапаны, воздуховоды.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Что нужно",
      options: [
        { value: "fan", label: "Вытяжной вентилятор в санузел или на кухню" },
        { value: "inlet", label: "Приточный клапан в стену", hint: "Свежий воздух при закрытых окнах" },
        { value: "duct", label: "Воздуховод от кухонной вытяжки" },
        { value: "diag", label: "Плохо тянет, запах, конденсат — разобраться" },
      ],
      default: "fan",
    },
    { id: "fans", type: "count", label: "Сколько вентиляторов", min: 1, max: 10, default: 1, when: { field: "job", is: ["fan"] } },
    {
      id: "fanUnit",
      type: "choice",
      label: "Вентилятор",
      options: [
        { value: "need", label: "Подберите и привезите" },
        { value: "have", label: "Уже есть" },
      ],
      default: "need",
      when: { field: "job", is: ["fan"] },
    },
    { id: "valve", type: "toggle", label: "Обратный клапан", hint: "Чтобы запахи от соседей не шли в квартиру", default: true, when: { field: "job", is: ["fan"] } },
    { id: "power", type: "toggle", label: "Провести питание к вентилятору", hint: "Если провода в месте установки нет", default: false, when: { field: "job", is: ["fan"] } },
    { id: "inlets", type: "count", label: "Сколько клапанов", min: 1, max: 10, default: 1, when: { field: "job", is: ["inlet"] } },
    { id: "ductLength", type: "size", unit: "м", label: "Длина воздуховода", hint: "От вытяжки до решётки вентканала", min: 1, max: 30, default: 3, when: { field: "job", is: ["duct"] } },
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    if (job === "fan") {
      const n = num(a, "fans");
      c.add("vent-fan", n);
      if (str(a, "fanUnit") === "need") c.add("mat-fan", n);
      if (bool(a, "valve")) {
        c.add("vent-valve", n);
        c.add("mat-vent-valve", n);
      } else c.warn("Без обратного клапана воздух и запахи из общего вентканала могут идти к вам или к соседям.");
      if (bool(a, "power")) {
        c.add("electric-new-point", n);
        c.add("mat-point", n);
      }
    } else if (job === "inlet") {
      const n = num(a, "inlets");
      c.add("vent-drill", n);
      c.add("vent-inlet", n);
      c.add("mat-inlet-valve", n);
      c.info("Отверстие сверлим алмазной коронкой 100–130 мм, обычно рядом с батареей: холодный воздух сразу прогревается.");
    } else if (job === "duct") {
      const l = num(a, "ductLength");
      c.add("vent-duct", l);
      c.add("mat-vent-duct", l);
    } else {
      c.add("vent-service", 1);
      c.info("Проверим тягу, клапаны и вентилятор. Стоимость работ — после диагностики.");
    }
    c.info("Общедомовой вентканал нельзя перекрывать, сужать и расширять — это требование управляющей компании.");
    return { ...c, reservePercent: 0 };
  },
};

const electric: Calculator = {
  id: "electric",
  title: "Электрика",
  intro: "Розетки и свет, щиток, отдельные линии, замена проводки.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Что нужно",
      options: [
        { value: "points", label: "Розетки, выключатели, светильники" },
        { value: "panel", label: "Щиток: автоматы и УЗО" },
        { value: "line", label: "Отдельная линия: плита, бойлер, кондиционер" },
        { value: "wiring", label: "Замена проводки в квартире" },
        { value: "fault", label: "Что-то не работает — найти неисправность" },
      ],
      default: "points",
    },
    { id: "sockets", type: "count", label: "Розетки и выключатели", min: 0, max: 100, default: 4, when: { field: "job", is: ["points"] } },
    { id: "lights", type: "count", label: "Светильники и люстры", min: 0, max: 50, default: 0, when: { field: "job", is: ["points"] } },
    {
      id: "placement",
      type: "choice",
      label: "Где ставим",
      options: [
        { value: "replace", label: "На старых местах, замена" },
        { value: "new", label: "Новые точки: штроба и кабель" },
      ],
      default: "replace",
      when: { field: "job", is: ["points"] },
    },
    {
      id: "devices",
      type: "choice",
      label: "Розетки и выключатели",
      options: [
        { value: "have", label: "Куплю сам" },
        { value: "need", label: "Подберите и привезите" },
      ],
      default: "have",
      when: { field: "job", is: ["points"] },
    },
    { id: "breakers", type: "count", label: "Автоматы", min: 0, max: 40, default: 6, when: { field: "job", is: ["panel"] } },
    { id: "rcd", type: "count", label: "УЗО и дифавтоматы", min: 0, max: 20, default: 2, when: { field: "job", is: ["panel"] } },
    { id: "lines", type: "count", label: "Сколько линий", min: 1, max: 5, default: 1, when: { field: "job", is: ["line"] } },
    { id: "area", type: "size", unit: "м²", label: "Площадь квартиры", min: 10, max: 500, default: 50, when: { field: "job", is: ["wiring"] } },
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    if (job === "points") {
      const s = num(a, "sockets");
      const l = num(a, "lights");
      if (s + l === 0) c.warn("Укажите, сколько розеток или светильников.");
      c.add("electric-socket", s);
      c.add("electric-light", l);
      if (str(a, "placement") === "new") {
        c.add("electric-new-point", s + l);
        c.add("mat-point", s + l);
        c.info("В панельных домах несущие стены штробить нельзя — там кабель пойдёт в коробе.");
      }
      if (str(a, "devices") === "need") c.add("mat-socket", s);
      c.info("Светильники и люстры выбираете вы — в расчёт входит только установка.");
    } else if (job === "panel") {
      const b = num(a, "breakers");
      const r = num(a, "rcd");
      c.add("electric-breaker", b);
      c.add("mat-breaker", b);
      c.add("electric-rcd", r);
      c.add("mat-rcd", r);
      c.info("Работы в этажном щите — только через управляющую компанию.");
    } else if (job === "line") {
      const n = num(a, "lines");
      c.add("electric-line", n);
      c.add("mat-power-cable", n * AC_LINE_CABLE_M);
      c.add("mat-breaker", n);
      c.info(`В расчёте ${AC_LINE_CABLE_M} м кабеля на линию; если щиток дальше — доплата за метры.`);
    } else if (job === "wiring") {
      const s = num(a, "area");
      c.add("electric-wiring", s);
      c.add("mat-wiring", s);
      c.info("Цену замены проводки сверяем по количеству точек после осмотра. Алюминиевую проводку меняем полностью.");
    } else {
      c.add("electric-diagnostics", 1);
      c.info("В расчёте первый час поиска. Стоимость ремонта — после того как найдём причину.");
    }
    return { ...c, reservePercent: 0 };
  },
};

const plumbing: Calculator = {
  id: "plumbing",
  title: "Сантехника и отопление",
  intro: "Установка и замена сантехники, разводка труб, радиаторы, течи и засоры.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Что нужно",
      options: [
        { value: "install", label: "Установить или заменить сантехнику" },
        { value: "pipes", label: "Разводка труб: санузел, кухня" },
        { value: "radiators", label: "Радиаторы отопления" },
        { value: "leak", label: "Течь" },
        { value: "clog", label: "Засор" },
      ],
      default: "install",
    },
    { id: "mixers", type: "count", label: "Смесители", min: 0, max: 10, default: 1, when: { field: "job", is: ["install"] } },
    { id: "toilets", type: "count", label: "Унитазы", min: 0, max: 5, default: 0, when: { field: "job", is: ["install"] } },
    { id: "sinks", type: "count", label: "Раковины и мойки", min: 0, max: 5, default: 0, when: { field: "job", is: ["install"] } },
    { id: "heaters", type: "count", label: "Водонагреватели", min: 0, max: 3, default: 0, when: { field: "job", is: ["install"] } },
    { id: "filters", type: "count", label: "Фильтры для воды", min: 0, max: 3, default: 0, when: { field: "job", is: ["install"] } },
    {
      id: "points",
      type: "count",
      label: "Сколько точек",
      hint: "Смеситель, унитаз, раковина, стиральная машина — каждая точка отдельно",
      min: 1,
      max: 30,
      default: 6,
      when: { field: "job", is: ["pipes"] },
    },
    { id: "radiators", type: "count", label: "Сколько радиаторов", min: 1, max: 20, default: 1, when: { field: "job", is: ["radiators"] } },
    {
      id: "building",
      type: "choice",
      label: "Дом",
      options: [
        { value: "flat", label: "Многоквартирный" },
        { value: "house", label: "Частный" },
      ],
      default: "flat",
      when: { field: "job", is: ["radiators"] },
    },
    { id: "urgent", type: "toggle", label: "Срочно, сегодня", default: false, when: { field: "job", is: ["leak", "clog"] } },
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    if (job === "install") {
      const items: [string, string][] = [
        ["mixers", "plumbing-mixer"],
        ["toilets", "plumbing-toilet"],
        ["sinks", "plumbing-sink"],
        ["heaters", "plumbing-heater"],
        ["filters", "plumbing-filter"],
      ];
      let total = 0;
      for (const [field, key] of items) {
        c.add(key, num(a, field));
        total += num(a, field);
      }
      if (total === 0) c.warn("Укажите, что установить.");
      c.add("mat-plumb-kit", total);
      c.info("Сами приборы (смеситель, унитаз, водонагреватель) покупаете вы — подскажем модель. В расчёт входят подводка, фитинги и краны.");
      c.warn("Старые краны и трубы иногда ломаются при снятии. Если понадобится замена — согласуем цену до работ.");
    } else if (job === "pipes") {
      const n = num(a, "points");
      c.add("plumbing-pipes", n);
      c.add("mat-pipe-point", n);
    } else if (job === "radiators") {
      const n = num(a, "radiators");
      c.add("plumbing-radiator", n);
      c.add("mat-radiator-kit", n);
      c.info("Радиаторы выбираете вы — в расчёт входят краны, фитинги и кронштейны.");
      if (str(a, "building") === "flat")
        c.warn("В многоквартирном доме стояк отключает и сливает управляющая компания. Лучше делать вне отопительного сезона.");
    } else {
      c.add(job === "leak" ? "plumbing-leak" : "plumbing-clog", 1);
      if (bool(a, "urgent")) c.add("general-urgent", 1);
      if (job === "leak") c.warn("Если течёт прямо сейчас — перекройте кран на вводе в квартиру и позвоните нам.");
    }
    return { ...c, reservePercent: 0 };
  },
};

const finishing: Calculator = {
  id: "finishing",
  title: "Отделка стен и потолков",
  intro: "Штукатурка, шпаклёвка, покраска, обои.",
  fields: [
    {
      id: "areaMode",
      type: "choice",
      label: "Что знаете о площади",
      options: [
        { value: "floor", label: "Площадь пола", hint: `Площадь стен посчитаем сами: пол × ${String(WALLS_PER_FLOOR).replace(".", ",")}` },
        { value: "walls", label: "Площадь стен" },
      ],
      default: "floor",
    },
    { id: "floorArea", type: "size", unit: "м²", label: "Площадь пола", min: 3, max: 500, default: 20, when: { field: "areaMode", is: ["floor"] } },
    { id: "wallArea", type: "size", unit: "м²", label: "Площадь стен", min: 5, max: 1500, default: 50, when: { field: "areaMode", is: ["walls"] } },
    { id: "ceiling", type: "toggle", label: "Потолок тоже", default: true },
    {
      id: "state",
      type: "choice",
      label: "Стены сейчас",
      options: [
        { value: "unknown", label: "Не знаю", hint: "Заложим выравнивание по маякам" },
        { value: "uneven", label: "Кривые, перепады больше 1 см" },
        { value: "even", label: "Ровные, хорошая штукатурка" },
      ],
      default: "unknown",
    },
    {
      id: "finish",
      type: "choice",
      label: "Что в итоге",
      options: [
        { value: "paint", label: "Покраска" },
        { value: "wallpaper", label: "Обои" },
        { value: "level", label: "Только выравнивание", hint: "Под плитку или под чистовую отделку" },
      ],
      default: "paint",
    },
    MATERIALS_CHOICE("Смеси, грунт и краску"),
  ],
  compute(a) {
    const c = collector();
    const byFloor = str(a, "areaMode") === "floor";
    const walls = byFloor ? Math.round(num(a, "floorArea") * WALLS_PER_FLOOR) : num(a, "wallArea");
    const ceiling = bool(a, "ceiling") ? (byFloor ? num(a, "floorArea") : Math.round(num(a, "wallArea") / WALLS_PER_FLOOR)) : 0;
    const level = str(a, "state") !== "even" || str(a, "finish") === "level";
    const finish = str(a, "finish");
    const we = str(a, "materials") === "we";

    if (level) c.add("finishing-plaster", walls);
    if (finish !== "level") c.add("finishing-putty", walls);
    if (finish === "paint") c.add("finishing-paint", walls);
    if (finish === "wallpaper") c.add("finishing-wallpaper", walls);
    if (ceiling) {
      if (str(a, "state") !== "even") c.add("finishing-ceiling", ceiling);
      c.add("finishing-putty", ceiling);
      c.add("finishing-paint", ceiling);
    }
    if (we) {
      c.add("mat-plaster", (level ? walls : 0) + (ceiling && str(a, "state") !== "even" ? ceiling : 0));
      c.add("mat-putty", (finish !== "level" ? walls : 0) + ceiling);
      c.add("mat-paint", (finish === "paint" ? walls : 0) + ceiling);
      if (finish === "wallpaper") c.add("mat-wallpaper-glue", walls);
    }
    mergeSame(c.lines);

    if (byFloor) c.info(`Площадь стен посчитали по полу: ${num(a, "floorArea")} м² × ${String(WALLS_PER_FLOOR).replace(".", ",")} ≈ ${walls} м². После замера уточним.`);
    if (str(a, "state") === "unknown") c.info("Состояние стен не знаем — заложили выравнивание по маякам. Если стены ровные, цена снизится.");
    if (finish === "wallpaper") c.info("Обои выбираете и покупаете вы — в расчёт входят клей и грунт.");
    if (finish === "paint" && we) c.info("В расчёте интерьерная краска среднего класса в 2 слоя.");
    c.info("Ровность проверяем правилом 2 м и боковым светом — договоримся об этом до начала работ.");
    return { ...c, reservePercent: 0 };
  },
};

const floors: Calculator = {
  id: "floors",
  title: "Полы и плитка",
  intro: "Ламинат, кварцвинил, плитка на пол и стены, стяжка.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Что нужно",
      options: [
        { value: "laminate", label: "Ламинат или кварцвинил" },
        { value: "tile", label: "Плитка или керамогранит на пол" },
        { value: "wallTile", label: "Плитка на стены: санузел, фартук" },
        { value: "screed", label: "Стяжка или выравнивание пола" },
      ],
      default: "laminate",
    },
    { id: "area", type: "size", unit: "м²", label: "Площадь", min: 1, max: 500, default: 20 },
    {
      id: "format",
      type: "choice",
      label: "Размер плитки",
      options: [
        { value: "normal", label: "Обычная, до 60×60" },
        { value: "large", label: "Крупная, 60×120 и больше" },
      ],
      default: "normal",
      when: { field: "job", is: ["tile", "wallTile"] },
    },
    {
      id: "base",
      type: "choice",
      label: "Пол сейчас",
      options: [
        { value: "unknown", label: "Не знаю", hint: "Заложим стяжку" },
        { value: "uneven", label: "Неровный, нужна стяжка" },
        { value: "even", label: "Ровный" },
      ],
      default: "unknown",
      when: { field: "job", is: ["laminate", "tile"] },
    },
    { id: "demolition", type: "toggle", label: "Снять старое покрытие", default: false },
    { id: "plinth", type: "toggle", label: "Плинтус", default: true, when: { field: "job", is: ["laminate", "tile"] } },
    MATERIALS_CHOICE("Клей, смеси и подложку"),
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    const area = num(a, "area");
    const we = str(a, "materials") === "we";
    const large = str(a, "format") === "large" && (job === "tile" || job === "wallTile");
    const screed = job === "screed" || ((job === "laminate" || job === "tile") && str(a, "base") !== "even");

    if (bool(a, "demolition")) c.add("turnkey-demolition", area);
    if (screed) {
      c.add("floors-screed", area);
      if (we) c.add("mat-screed", area);
    }
    if (job === "laminate") {
      c.add("floors-laminate", area);
      if (we) c.add("mat-underlay", area);
    }
    if (job === "tile" || job === "wallTile") {
      c.add(job === "tile" ? "floors-tile" : "floors-wall-tile", area);
      if (large) c.add("floors-tile-large", area);
      if (we) c.add("mat-tile-glue", area);
    }
    if ((job === "laminate" || job === "tile") && bool(a, "plinth")) {
      // Периметр по площади: для одной комнаты — как у квадрата, для квартиры — около 0,9 м на 1 м² пола
      const perimeter = Math.round(Math.max(4 * Math.sqrt(area), 0.9 * area));
      c.add("floors-plinth", perimeter);
      if (we) c.add("mat-plinth", perimeter);
    }

    if (job !== "screed") c.info(`Покрытие выбираете и покупаете вы — берите с запасом ${job === "laminate" ? "10%" : "10–15%"} на подрезку.`);
    if (screed && job !== "screed" && str(a, "base") === "unknown") c.info("Какое основание — не знаем, поэтому заложили стяжку. Если пол ровный, цена снизится.");
    if (screed) c.warn("Цементная стяжка сохнет около 4 недель. Укладка на сырую стяжку — брак, поэтому сроки учитываем заранее.");
    if (large) c.info("Крупный формат дороже в работе: нужна система выравнивания и два мастера.");
    return { ...c, reservePercent: 0 };
  },
};

const facade: Calculator = {
  id: "facade",
  title: "Фасады",
  intro: "Штукатурка, утепление, покраска, межпанельные швы, откосы.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Что нужно",
      options: [
        { value: "plaster", label: "Штукатурка и покраска" },
        { value: "insulation", label: "Утепление с отделкой" },
        { value: "paint", label: "Только покраска" },
        { value: "joints", label: "Межпанельные швы квартиры" },
        { value: "slopes", label: "Откосы и отливы" },
      ],
      default: "plaster",
    },
    {
      id: "area",
      type: "size",
      unit: "м²",
      label: "Площадь фасада",
      hint: "Периметр дома × высота, без окон",
      min: 10,
      max: 5000,
      default: 150,
      when: { field: "job", is: ["plaster", "insulation", "paint"] },
    },
    {
      id: "access",
      type: "choice",
      label: "Высота",
      options: [
        { value: "ground", label: "1 этаж, работа с земли" },
        { value: "scaffold", label: "2–3 этажа, нужны леса" },
        { value: "high", label: "Выше 3 этажей" },
      ],
      default: "scaffold",
      when: { field: "job", is: ["plaster", "insulation", "paint"] },
    },
    { id: "joints", type: "size", unit: "м", label: "Длина швов", hint: "Швы вокруг вашей квартиры, в метрах", min: 1, max: 500, default: 30, when: { field: "job", is: ["joints"] } },
    { id: "slopes", type: "size", unit: "м", label: "Длина откосов и отливов", min: 1, max: 300, default: 10, when: { field: "job", is: ["slopes"] } },
    { ...MATERIALS_CHOICE("Смеси, утеплитель и краску"), when: { field: "job", is: ["plaster", "insulation", "paint"] } },
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    const we = str(a, "materials") !== "client";
    if (job === "joints") {
      const l = num(a, "joints");
      c.add("facade-joints", l);
      c.add("mat-joint", l);
      c.add("general-height", 1);
      c.info("Швы многоквартирного дома жильцы заказывают по своей квартире, остальное — через управляющую компанию.");
    } else if (job === "slopes") {
      const l = num(a, "slopes");
      c.add("facade-slopes", l);
      c.add("mat-slopes", l);
    } else {
      const s = num(a, "area");
      if (job === "plaster") c.add("facade-plaster", s);
      if (job === "insulation") c.add("facade-insulation", s);
      c.add("facade-paint", s);
      if (we) {
        if (job === "plaster") c.add("mat-facade-plaster", s);
        if (job === "insulation") c.add("mat-facade-insulation", s);
        c.add("mat-facade-paint", s);
      }
      if (str(a, "access") !== "ground") c.add("facade-scaffold", s);
      if (str(a, "access") === "high") c.warn("Выше 3 этажей нужны альпинисты или вышка — стоимость доступа уточним после осмотра.");
      if (job !== "paint") c.warn("Штукатурка и утепление — при температуре от +5 °C, обычно с апреля по октябрь.");
    }
    c.info("Фасады всегда считаем после осмотра: это ориентир, точная цена — в смете.");
    return { ...c, reservePercent: 0 };
  },
};

const turnkey: Calculator = {
  id: "turnkey",
  title: "Ремонт под ключ",
  intro: "Квартиры, санузлы, офисы: от демонтажа до уборки.",
  fields: [
    {
      id: "job",
      type: "choice",
      label: "Какой ремонт",
      options: [
        { value: "cosmetic", label: "Косметический", hint: "Стены, потолки, полы без переноса коммуникаций" },
        { value: "capital", label: "Капитальный", hint: "С заменой электрики, сантехники, стяжкой" },
        { value: "bathroom", label: "Санузел под ключ" },
        { value: "commercial", label: "Офис или коммерческое помещение" },
      ],
      default: "cosmetic",
    },
    { id: "area", type: "size", unit: "м²", label: "Площадь по полу", min: 10, max: 1000, default: 50, when: { field: "job", is: ["cosmetic", "capital", "commercial"] } },
    { id: "bathrooms", type: "count", label: "Сколько санузлов", min: 1, max: 5, default: 1, when: { field: "job", is: ["bathroom"] } },
    {
      id: "housing",
      type: "choice",
      label: "Квартира",
      options: [
        { value: "old", label: "Вторичка, нужен демонтаж" },
        { value: "new", label: "Новостройка" },
      ],
      default: "old",
      when: { field: "job", is: ["capital"] },
    },
    MATERIALS_CHOICE("Черновые материалы"),
  ],
  compute(a) {
    const c = collector();
    const job = str(a, "job");
    const we = str(a, "materials") === "we";
    if (job === "bathroom") {
      const n = num(a, "bathrooms");
      c.add("turnkey-bathroom", n);
      if (we) c.add("mat-rough-bathroom", n);
    } else {
      const s = num(a, "area");
      c.add(job === "capital" ? "turnkey-capital" : job === "commercial" ? "turnkey-commercial" : "turnkey-cosmetic", s);
      if (we) c.add(job === "capital" ? "mat-rough-capital" : "mat-rough-cosmetic", s);
      if (job === "capital" && str(a, "housing") === "old") c.add("turnkey-demolition", s);
      if (job === "capital") c.add("general-garbage", Math.max(1, Math.ceil(s / 30)));
    }
    c.info("Чистовые материалы (плитка, ламинат, краска, сантехника, двери) выбираете вы — в расчёт не входят.");
    c.info("Резерв 10% на непредвиденные работы показан отдельно и оплачивается, только если понадобился.");
    c.warn("Ремонт под ключ считаем по смете после осмотра вместе с прорабом, оплата — по этапам.");
    return { ...c, reservePercent: 10 };
  },
};

export const CALCULATORS: Readonly<Record<CalcId, Calculator>> = { climate, vent, electric, plumbing, finishing, floors, facade, turnkey };

export const CALC_IDS = Object.keys(CALCULATORS) as CalcId[];

export function isCalcId(v: string): v is CalcId {
  return v in CALCULATORS;
}

/** Одинаковые позиции (шпаклёвка стен и потолка) — одной строкой. */
function mergeSame(lines: CalcLineRef[]): void {
  for (let i = 0; i < lines.length; i++)
    for (let j = lines.length - 1; j > i; j--)
      if (lines[j]!.key === lines[i]!.key) {
        lines[i]!.qty = round1(lines[i]!.qty + lines[j]!.qty);
        lines.splice(j, 1);
      }
}

export function fieldVisible(f: CalcField, a: Answers): boolean {
  return !f.when || f.when.is.includes(a[f.when.field] as string | boolean);
}

/**
 * Приводит ответы к допустимым: чужие поля отбрасываются, числа ограничиваются, скрытые вопросы убираются.
 * Одна и та же функция на сайте (состояние формы) и на сервере (проверка присланного).
 */
export function normalizeAnswers(calc: Calculator, raw: unknown): Answers {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Answers = {};
  for (const f of calc.fields) {
    if (!fieldVisible(f, out)) continue;
    const v = src[f.id];
    if (f.type === "choice") out[f.id] = typeof v === "string" && f.options.some((o) => o.value === v) ? v : f.default;
    else if (f.type === "toggle") out[f.id] = typeof v === "boolean" ? v : f.default;
    else {
      const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
      const clamped = Number.isFinite(n) ? Math.min(Math.max(n, f.min), f.max) : f.default;
      out[f.id] = f.type === "count" ? Math.round(clamped) : round1(clamped);
    }
  }
  return out;
}

/** «Длина трассы: знаю длину», «Площадь пола: 20 м²» — ответы словами для заявки и карточки владельца. */
export function describeAnswers(calc: Calculator, a: Answers): string[] {
  const out: string[] = [];
  for (const f of calc.fields) {
    if (!fieldVisible(f, a) || a[f.id] === undefined) continue;
    const v = a[f.id]!;
    if (f.type === "choice") out.push(`${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}`);
    else if (f.type === "toggle") {
      if (v === true) out.push(f.label);
    } else if (f.type === "count") {
      if (Number(v) > 0) out.push(`${f.label}: ${v}`);
    } else out.push(`${f.label}: ${String(v).replace(".", ",")} ${f.unit}`);
  }
  return out;
}

/** Позиция прайса для расчёта. price — копейки, null — цены ещё нет (строка «по смете»). */
export type PriceItem = { key: string; kind: ItemKind; name: string; unit: Unit; price: Kopecks | null };

export type QuoteLine = { key: string; kind: ItemKind; name: string; unit: Unit; qty: number; price: Kopecks | null; total: Kopecks | null };

export type Quote = {
  calc: CalcId;
  answers: Answers;
  lines: QuoteLine[];
  totals: EstimateTotals;
  notes: CalcNote[];
  reservePercent: number;
  /** Сколько строк без цены: они не вошли в итог, цену назовём при звонке. */
  unpriced: number;
};

/** Расчёт по ответам и прайсу. Позиции, которых нет в прайсе или которые выключены, пропускаются. */
export function quote(calcId: CalcId, rawAnswers: unknown, prices: ReadonlyMap<string, PriceItem>): Quote {
  const calc = CALCULATORS[calcId];
  const answers = normalizeAnswers(calc, rawAnswers);
  const out = calc.compute(answers);
  const lines: QuoteLine[] = [];
  for (const l of out.lines) {
    const p = prices.get(l.key);
    if (!p) continue;
    lines.push({ key: l.key, kind: p.kind, name: p.name, unit: p.unit, qty: l.qty, price: p.price, total: p.price === null ? null : lineTotal(p.price, l.qty) });
  }
  const priced = lines.filter((l) => l.price !== null).map((l) => ({ kind: l.kind, qty: l.qty, price: l.price! }));
  return {
    calc: calcId,
    answers,
    lines,
    totals: estimateTotals(priced, out.reservePercent),
    notes: out.notes,
    reservePercent: out.reservePercent,
    unpriced: lines.length - priced.length,
  };
}
