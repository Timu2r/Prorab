import type { ItemKind } from "./estimate";

/** Направления работ. Порядок — как на сайте. */
export const CATEGORIES = ["turnkey", "finishing", "floors", "facade", "electric", "plumbing", "climate", "vent", "general"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  turnkey: "Ремонт под ключ",
  finishing: "Отделка стен и потолков",
  floors: "Полы и плитка",
  facade: "Фасады",
  electric: "Электрика",
  plumbing: "Сантехника и отопление",
  climate: "Кондиционеры",
  vent: "Вентиляция",
  general: "Другое",
};

export const UNITS = ["pcs", "m", "m2", "point", "hour", "visit"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  pcs: "шт",
  m: "м",
  m2: "м²",
  point: "точка",
  hour: "час",
  visit: "выезд",
};

/**
 * Позиции прайса на старте (docs/TZ.md, раздел 6). Цены вписывает владелец.
 * key — постоянный идентификатор позиции: по нему строится id в базе, менять нельзя.
 * kind — работа, материал или оборудование (по умолчанию работа). Материалы и оборудование нужны калькулятору на
 * сайте (docs/KALKULYATOR.md): он считает их отдельными строками, чтобы клиент видел, за что платит.
 */
export const DEFAULT_SERVICES: readonly { key: string; category: Category; name: string; unit: Unit; kind?: ItemKind }[] = [
  { key: "turnkey-cosmetic", category: "turnkey", name: "Косметический ремонт квартиры", unit: "m2" },
  { key: "turnkey-capital", category: "turnkey", name: "Капитальный ремонт квартиры", unit: "m2" },
  { key: "turnkey-bathroom", category: "turnkey", name: "Ремонт санузла под ключ", unit: "pcs" },
  { key: "turnkey-commercial", category: "turnkey", name: "Ремонт офиса или коммерческого помещения", unit: "m2" },
  { key: "turnkey-demolition", category: "turnkey", name: "Демонтажные работы", unit: "m2" },

  { key: "finishing-plaster", category: "finishing", name: "Штукатурка стен по маякам", unit: "m2" },
  { key: "finishing-putty", category: "finishing", name: "Шпаклёвка стен под покраску", unit: "m2" },
  { key: "finishing-paint", category: "finishing", name: "Покраска стен и потолков", unit: "m2" },
  { key: "finishing-wallpaper", category: "finishing", name: "Поклейка обоев", unit: "m2" },
  { key: "finishing-drywall", category: "finishing", name: "Монтаж гипсокартона", unit: "m2" },
  { key: "finishing-ceiling", category: "finishing", name: "Выравнивание потолка", unit: "m2" },

  { key: "floors-screed", category: "floors", name: "Стяжка пола", unit: "m2" },
  { key: "floors-laminate", category: "floors", name: "Укладка ламината или кварцвинила", unit: "m2" },
  { key: "floors-tile", category: "floors", name: "Укладка плитки на пол", unit: "m2" },
  { key: "floors-wall-tile", category: "floors", name: "Облицовка стен плиткой", unit: "m2" },
  { key: "floors-plinth", category: "floors", name: "Монтаж плинтуса", unit: "m" },

  { key: "facade-plaster", category: "facade", name: "Штукатурка фасада", unit: "m2" },
  { key: "facade-insulation", category: "facade", name: "Утепление фасада", unit: "m2" },
  { key: "facade-paint", category: "facade", name: "Покраска фасада", unit: "m2" },
  { key: "facade-joints", category: "facade", name: "Герметизация межпанельных швов", unit: "m" },
  { key: "facade-plinth", category: "facade", name: "Ремонт и отделка цоколя", unit: "m2" },
  { key: "facade-slopes", category: "facade", name: "Монтаж откосов и отливов", unit: "m" },

  { key: "electric-wiring", category: "electric", name: "Замена электропроводки в квартире", unit: "m2" },
  { key: "electric-socket", category: "electric", name: "Установка розетки или выключателя", unit: "point" },
  { key: "electric-breaker", category: "electric", name: "Установка автомата", unit: "pcs" },
  { key: "electric-rcd", category: "electric", name: "Установка УЗО", unit: "pcs" },
  { key: "electric-light", category: "electric", name: "Установка светильника или люстры", unit: "pcs" },
  { key: "electric-ac-line", category: "electric", name: "Отдельная линия под кондиционер", unit: "pcs" },
  { key: "electric-diagnostics", category: "electric", name: "Поиск неисправности", unit: "hour" },

  { key: "plumbing-pipes", category: "plumbing", name: "Разводка водоснабжения и канализации", unit: "point" },
  { key: "plumbing-radiator", category: "plumbing", name: "Установка радиатора отопления", unit: "pcs" },
  { key: "plumbing-mixer", category: "plumbing", name: "Установка смесителя", unit: "pcs" },
  { key: "plumbing-toilet", category: "plumbing", name: "Установка унитаза", unit: "pcs" },
  { key: "plumbing-sink", category: "plumbing", name: "Установка раковины", unit: "pcs" },
  { key: "plumbing-heater", category: "plumbing", name: "Установка водонагревателя", unit: "pcs" },
  { key: "plumbing-filter", category: "plumbing", name: "Установка фильтра", unit: "pcs" },
  { key: "plumbing-leak", category: "plumbing", name: "Устранение течи", unit: "pcs" },
  { key: "plumbing-clog", category: "plumbing", name: "Устранение засора", unit: "pcs" },

  { key: "climate-mount-small", category: "climate", name: "Монтаж сплит-системы 7-12 BTU (трасса до 3 м)", unit: "pcs" },
  { key: "climate-mount-large", category: "climate", name: "Монтаж сплит-системы 18-24 BTU (трасса до 3 м)", unit: "pcs" },
  { key: "climate-extra-pipe", category: "climate", name: "Прокладка трассы сверх 3 м", unit: "m" },
  { key: "climate-dismount", category: "climate", name: "Демонтаж сплит-системы", unit: "pcs" },
  { key: "climate-move", category: "climate", name: "Перенос сплит-системы", unit: "pcs" },
  { key: "climate-service", category: "climate", name: "Чистка и ТО сплит-системы", unit: "pcs" },
  { key: "climate-freon", category: "climate", name: "Дозаправка фреоном", unit: "pcs" },
  { key: "climate-diagnostics", category: "climate", name: "Диагностика", unit: "visit" },
  { key: "climate-chase", category: "climate", name: "Штроба под трассу", unit: "m" },
  { key: "climate-pump", category: "climate", name: "Установка дренажной помпы", unit: "pcs" },

  { key: "vent-fan", category: "vent", name: "Монтаж вытяжного вентилятора", unit: "pcs" },
  { key: "vent-valve", category: "vent", name: "Установка обратного клапана", unit: "pcs" },
  { key: "vent-duct", category: "vent", name: "Монтаж воздуховода", unit: "m" },
  { key: "vent-inlet", category: "vent", name: "Установка приточного клапана", unit: "pcs" },
  { key: "vent-service", category: "vent", name: "Диагностика и чистка вентиляции", unit: "visit" },

  { key: "general-visit", category: "general", name: "Выезд без выполнения работ", unit: "visit" },
  { key: "general-urgent", category: "general", name: "Срочный выезд", unit: "visit" },
  { key: "general-height", category: "general", name: "Работа на высоте", unit: "pcs" },

  // Работы для калькулятора на сайте
  { key: "climate-duct", category: "climate", name: "Монтаж декоративного короба для трассы", unit: "m" },
  { key: "vent-drill", category: "vent", name: "Алмазное бурение отверстия 100–130 мм", unit: "pcs" },
  { key: "electric-new-point", category: "electric", name: "Новая точка: подрозетник, штроба и кабель", unit: "point" },
  { key: "electric-line", category: "electric", name: "Отдельная линия от щитка до 15 м", unit: "pcs" },
  { key: "floors-tile-large", category: "floors", name: "Надбавка за крупный формат плитки", unit: "m2" },
  { key: "facade-scaffold", category: "facade", name: "Леса: монтаж, аренда и демонтаж", unit: "m2" },
  { key: "general-garbage", category: "general", name: "Вывоз строительного мусора", unit: "visit" },

  // Материалы: закупаем по счёту клиента, цена — розничная
  { key: "mat-copper-14", category: "climate", name: "Медная труба 1/4″ (6,35 мм)", unit: "m", kind: "material" },
  { key: "mat-copper-38", category: "climate", name: "Медная труба 3/8″ (9,52 мм)", unit: "m", kind: "material" },
  { key: "mat-copper-12", category: "climate", name: "Медная труба 1/2″ (12,7 мм)", unit: "m", kind: "material" },
  { key: "mat-insulation", category: "climate", name: "Теплоизоляция для медной трубы", unit: "m", kind: "material" },
  { key: "mat-ac-cable", category: "climate", name: "Межблочный кабель ПВС 4×1,5", unit: "m", kind: "material" },
  { key: "mat-drain-hose", category: "climate", name: "Дренажный шланг", unit: "m", kind: "material" },
  { key: "mat-ac-brackets", category: "climate", name: "Кронштейны наружного блока", unit: "pcs", kind: "material" },
  { key: "mat-ac-kit", category: "climate", name: "Крепёж, лента и герметик для монтажа", unit: "pcs", kind: "material" },
  { key: "mat-ac-duct", category: "climate", name: "Декоративный короб с поворотами", unit: "m", kind: "material" },
  { key: "mat-drain-pump", category: "climate", name: "Дренажная помпа", unit: "pcs", kind: "material" },
  { key: "mat-power-cable", category: "electric", name: "Силовой кабель ВВГнг 3×2,5", unit: "m", kind: "material" },
  { key: "mat-breaker", category: "electric", name: "Автоматический выключатель", unit: "pcs", kind: "material" },
  { key: "mat-rcd", category: "electric", name: "УЗО или дифавтомат", unit: "pcs", kind: "material" },
  { key: "mat-point", category: "electric", name: "Материалы на точку: подрозетник, кабель, гофра", unit: "point", kind: "material" },
  { key: "mat-socket", category: "electric", name: "Розетка или выключатель", unit: "pcs", kind: "material" },
  { key: "mat-wiring", category: "electric", name: "Кабель, коробки и щиток для замены проводки", unit: "m2", kind: "material" },
  { key: "mat-fan", category: "vent", name: "Вытяжной вентилятор", unit: "pcs", kind: "material" },
  { key: "mat-vent-valve", category: "vent", name: "Обратный клапан", unit: "pcs", kind: "material" },
  { key: "mat-inlet-valve", category: "vent", name: "Приточный клапан в стену", unit: "pcs", kind: "material" },
  { key: "mat-vent-duct", category: "vent", name: "Воздуховод с фасонными частями", unit: "m", kind: "material" },
  { key: "mat-plumb-kit", category: "plumbing", name: "Подводка, фитинги и краны на один прибор", unit: "pcs", kind: "material" },
  { key: "mat-radiator-kit", category: "plumbing", name: "Краны, фитинги и кронштейны для радиатора", unit: "pcs", kind: "material" },
  { key: "mat-pipe-point", category: "plumbing", name: "Трубы и фитинги на точку разводки", unit: "point", kind: "material" },
  { key: "mat-plaster", category: "finishing", name: "Штукатурная смесь, маяки, грунт", unit: "m2", kind: "material" },
  { key: "mat-putty", category: "finishing", name: "Шпаклёвка стартовая и финишная, грунт", unit: "m2", kind: "material" },
  { key: "mat-paint", category: "finishing", name: "Интерьерная краска в 2 слоя и грунт", unit: "m2", kind: "material" },
  { key: "mat-wallpaper-glue", category: "finishing", name: "Клей для обоев и грунт", unit: "m2", kind: "material" },
  { key: "mat-underlay", category: "floors", name: "Подложка и плёнка под ламинат", unit: "m2", kind: "material" },
  { key: "mat-tile-glue", category: "floors", name: "Плиточный клей, затирка, крестики", unit: "m2", kind: "material" },
  { key: "mat-screed", category: "floors", name: "Смесь для стяжки, маяки, демпферная лента", unit: "m2", kind: "material" },
  { key: "mat-plinth", category: "floors", name: "Плинтус с крепежом", unit: "m", kind: "material" },
  { key: "mat-facade-plaster", category: "facade", name: "Фасадная штукатурка, сетка, грунт", unit: "m2", kind: "material" },
  { key: "mat-facade-insulation", category: "facade", name: "Утеплитель 100 мм, клей, дюбели, сетка", unit: "m2", kind: "material" },
  { key: "mat-facade-paint", category: "facade", name: "Фасадная краска и грунт", unit: "m2", kind: "material" },
  { key: "mat-joint", category: "facade", name: "Герметик и уплотнитель для швов", unit: "m", kind: "material" },
  { key: "mat-slopes", category: "facade", name: "Материалы для откосов и отливов", unit: "m", kind: "material" },
  { key: "mat-rough-cosmetic", category: "turnkey", name: "Черновые материалы: косметический ремонт", unit: "m2", kind: "material" },
  { key: "mat-rough-capital", category: "turnkey", name: "Черновые материалы: капитальный ремонт", unit: "m2", kind: "material" },
  { key: "mat-rough-bathroom", category: "turnkey", name: "Черновые материалы для санузла", unit: "pcs", kind: "material" },

  // Оборудование: продаём с монтажом, модель подбираем под помещение
  { key: "eq-split-small", category: "climate", name: "Сплит-система для комнаты до 35 м² (инвертор)", unit: "pcs", kind: "equipment" },
  { key: "eq-split-large", category: "climate", name: "Сплит-система для комнаты 35–70 м² (инвертор)", unit: "pcs", kind: "equipment" },
];

/**
 * Рыночные цены «от» по Москве на сентябрь 2026 (только работа, рубли) — стартовый ориентир по прайсам
 * profi.ru, domashniy-masterok.ru, splitis.ru, hands.ru. Владелец меняет их в кабинете; миграция 3
 * подставляет их только туда, где цены ещё нет.
 */
export const MARKET_PRICES_RUB: Readonly<Record<string, number>> = {
  "turnkey-cosmetic": 5_500,
  "turnkey-capital": 11_000,
  "turnkey-bathroom": 150_000,
  "turnkey-commercial": 4_500,
  "turnkey-demolition": 350,
  "finishing-plaster": 600,
  "finishing-putty": 550,
  "finishing-paint": 300,
  "finishing-wallpaper": 450,
  "finishing-drywall": 750,
  "finishing-ceiling": 700,
  "floors-screed": 550,
  "floors-laminate": 550,
  "floors-tile": 1_500,
  "floors-wall-tile": 1_800,
  "floors-plinth": 300,
  "facade-plaster": 800,
  "facade-insulation": 1_600,
  "facade-paint": 400,
  "facade-joints": 550,
  "facade-plinth": 1_200,
  "facade-slopes": 800,
  "electric-wiring": 1_800,
  "electric-socket": 450,
  "electric-breaker": 350,
  "electric-rcd": 600,
  "electric-light": 1_200,
  "electric-ac-line": 5_000,
  "electric-diagnostics": 1_500,
  "plumbing-pipes": 3_500,
  "plumbing-radiator": 3_000,
  "plumbing-mixer": 1_500,
  "plumbing-toilet": 4_000,
  "plumbing-sink": 3_000,
  "plumbing-heater": 5_000,
  "plumbing-filter": 2_000,
  "plumbing-leak": 1_500,
  "plumbing-clog": 2_000,
  "climate-mount-small": 9_900,
  "climate-mount-large": 14_900,
  "climate-extra-pipe": 900, // только работа: медь, изоляция и кабель — отдельными материалами
  "climate-dismount": 3_500,
  "climate-move": 12_900,
  "climate-service": 3_500,
  "climate-freon": 3_000,
  "climate-diagnostics": 1_500,
  "climate-chase": 1_200,
  "climate-pump": 4_500,
  "vent-fan": 1_800,
  "vent-valve": 1_000,
  "vent-duct": 900,
  "vent-inlet": 5_000,
  "vent-service": 3_000,
  "general-visit": 1_000,
  "general-urgent": 2_000,
  "general-height": 3_000,
  "climate-duct": 450,
  "vent-drill": 3_500,
  "electric-new-point": 1_500,
  "electric-line": 5_000,
  "floors-tile-large": 700,
  "facade-scaffold": 350,
  "general-garbage": 6_000,
};

/**
 * Материалы и оборудование: розничные цены по Москве на сентябрь 2026 (рубли). Продаём по рознице — заработок на
 * закупке по оптовой цене, поэтому наценку 10% сюда не добавляем. Владелец проверяет цены и вписывает закупочные.
 */
export const GOODS_PRICES_RUB: Readonly<Record<string, number>> = {
  "mat-copper-14": 450,
  "mat-copper-38": 650,
  "mat-copper-12": 850,
  "mat-insulation": 70,
  "mat-ac-cable": 130,
  "mat-drain-hose": 60,
  "mat-ac-brackets": 2_000,
  "mat-ac-kit": 800,
  "mat-ac-duct": 450,
  "mat-drain-pump": 5_500,
  "mat-power-cable": 150,
  "mat-breaker": 600,
  "mat-rcd": 3_200,
  "mat-point": 600,
  "mat-socket": 400,
  "mat-wiring": 1_500,
  "mat-fan": 3_500,
  "mat-vent-valve": 700,
  "mat-inlet-valve": 7_500,
  "mat-vent-duct": 600,
  "mat-plumb-kit": 1_200,
  "mat-radiator-kit": 3_000,
  "mat-pipe-point": 1_800,
  "mat-plaster": 450,
  "mat-putty": 200,
  "mat-paint": 220,
  "mat-wallpaper-glue": 60,
  "mat-underlay": 150,
  "mat-tile-glue": 450,
  "mat-screed": 600,
  "mat-plinth": 250,
  "mat-facade-plaster": 700,
  "mat-facade-insulation": 1_900,
  "mat-facade-paint": 280,
  "mat-joint": 200,
  "mat-slopes": 600,
  "mat-rough-cosmetic": 2_500,
  "mat-rough-capital": 6_500,
  "mat-rough-bathroom": 55_000,
  "eq-split-small": 42_000,
  "eq-split-large": 80_000,
};

/** Стартовая наценка к рынку (решение владельца 2026-09-26: «чуть выше рыночных»): договор, гарантия и чек. */
export const START_MARKUP_PERCENT = 10;

/** «Красивая» цена: до 10 ₽ ниже 1 000, до 100 ₽ ниже 10 000, дальше до 500 ₽. */
export function roundPriceRub(rub: number): number {
  const step = rub < 1_000 ? 10 : rub < 10_000 ? 100 : 500;
  return Math.round(rub / step) * step;
}

/** Стартовая цена позиции для прайса: рынок + наценка, округлённая. null — позиции нет в рыночном списке. */
export function startPriceRub(key: string, markupPercent = START_MARKUP_PERCENT): number | null {
  const market = MARKET_PRICES_RUB[key];
  return market === undefined ? null : roundPriceRub(market * (1 + markupPercent / 100));
}

/**
 * Главная работа направления: её цену показываем на карточке направления («Шпаклёвка от 610 ₽/м²»),
 * а не самую дешёвую позицию — «Ремонт под ключ от 390 ₽» за демонтаж ввёл бы клиента в заблуждение.
 */
export const HEADLINE_SERVICES: Record<Exclude<Category, "general">, { key: string; label: string }> = {
  turnkey: { key: "turnkey-cosmetic", label: "Косметический ремонт" },
  finishing: { key: "finishing-putty", label: "Шпаклёвка" },
  floors: { key: "floors-tile", label: "Плитка" },
  facade: { key: "facade-plaster", label: "Штукатурка фасада" },
  electric: { key: "electric-socket", label: "Розетка" },
  plumbing: { key: "plumbing-mixer", label: "Смеситель" },
  climate: { key: "climate-mount-small", label: "Монтаж" },
  vent: { key: "vent-fan", label: "Вентилятор" },
};

/** Примеры работ направления — для карточек на сайте и в приложении. */
export const CATEGORY_WORKS: Record<Exclude<Category, "general">, string[]> = {
  turnkey: ["Квартиры и дома", "Санузлы", "Офисы и магазины"],
  finishing: ["Штукатурка и шпаклёвка", "Покраска и обои", "Гипсокартон"],
  floors: ["Стяжка", "Ламинат и кварцвинил", "Плитка на пол и стены"],
  facade: ["Штукатурка и покраска", "Утепление", "Межпанельные швы"],
  electric: ["Замена проводки", "Щиты, автоматы, УЗО", "Розетки и свет"],
  plumbing: ["Разводка труб", "Радиаторы отопления", "Сантехприборы"],
  climate: ["Продажа и монтаж", "Чистка и ТО", "Заправка фреоном"],
  vent: ["Вытяжные вентиляторы", "Воздуховоды", "Приточные клапаны"],
};

/** «от 610 ₽/м²»: поштучные позиции — без «/шт». */
export function priceFromText(price: number, unit: Unit): string {
  const per = unit === "pcs" || unit === "visit" || unit === "point" ? "" : `/${UNIT_LABELS[unit]}`;
  return `от ${formatRubShort(price)}${per}`;
}

function formatRubShort(k: number): string {
  return `${Math.round(k / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}

/** Стартовая цена любой позиции прайса: работы — рынок + наценка, материалы и оборудование — розница. */
export function defaultPriceRub(key: string): number | null {
  return GOODS_PRICES_RUB[key] ?? startPriceRub(key);
}
