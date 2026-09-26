export const CATEGORIES = ["climate", "vent", "electric", "plumbing", "general"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  climate: "Кондиционеры",
  vent: "Вентиляция",
  electric: "Электрика",
  plumbing: "Сантехника",
  general: "Общее",
};

export const UNITS = ["pcs", "m", "hour", "visit"] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  pcs: "шт",
  m: "м",
  hour: "час",
  visit: "выезд",
};

/** Позиции прайса на старте (docs/TZ.md, раздел 6). Цены вписывает владелец. */
export const DEFAULT_SERVICES: readonly { category: Category; name: string; unit: Unit }[] = [
  { category: "climate", name: "Монтаж сплит-системы 7-12 BTU (трасса до 3 м)", unit: "pcs" },
  { category: "climate", name: "Монтаж сплит-системы 18-24 BTU (трасса до 3 м)", unit: "pcs" },
  { category: "climate", name: "Трасса сверх стандартной", unit: "m" },
  { category: "climate", name: "Демонтаж сплит-системы", unit: "pcs" },
  { category: "climate", name: "Перенос сплит-системы", unit: "pcs" },
  { category: "climate", name: "Чистка и ТО сплит-системы", unit: "pcs" },
  { category: "climate", name: "Дозаправка фреоном", unit: "pcs" },
  { category: "climate", name: "Диагностика", unit: "visit" },
  { category: "climate", name: "Штроба под трассу", unit: "m" },
  { category: "climate", name: "Установка дренажной помпы", unit: "pcs" },
  { category: "vent", name: "Монтаж вытяжного вентилятора", unit: "pcs" },
  { category: "vent", name: "Установка обратного клапана", unit: "pcs" },
  { category: "vent", name: "Монтаж воздуховода", unit: "m" },
  { category: "vent", name: "Установка приточного клапана", unit: "pcs" },
  { category: "vent", name: "Диагностика и чистка вентиляции", unit: "visit" },
  { category: "electric", name: "Установка розетки или выключателя", unit: "pcs" },
  { category: "electric", name: "Установка автомата", unit: "pcs" },
  { category: "electric", name: "Установка УЗО", unit: "pcs" },
  { category: "electric", name: "Установка светильника или люстры", unit: "pcs" },
  { category: "electric", name: "Отдельная линия под кондиционер", unit: "pcs" },
  { category: "electric", name: "Поиск неисправности", unit: "hour" },
  { category: "plumbing", name: "Установка смесителя", unit: "pcs" },
  { category: "plumbing", name: "Установка унитаза", unit: "pcs" },
  { category: "plumbing", name: "Установка раковины", unit: "pcs" },
  { category: "plumbing", name: "Установка водонагревателя", unit: "pcs" },
  { category: "plumbing", name: "Установка фильтра", unit: "pcs" },
  { category: "plumbing", name: "Устранение течи", unit: "pcs" },
  { category: "plumbing", name: "Устранение засора", unit: "pcs" },
  { category: "general", name: "Выезд без выполнения работ", unit: "visit" },
  { category: "general", name: "Срочный выезд", unit: "visit" },
  { category: "general", name: "Работа на высоте", unit: "pcs" },
];
