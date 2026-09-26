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
 */
export const DEFAULT_SERVICES: readonly { key: string; category: Category; name: string; unit: Unit }[] = [
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
  { key: "climate-extra-pipe", category: "climate", name: "Трасса сверх стандартной", unit: "m" },
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
  "climate-extra-pipe": 1_800,
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
