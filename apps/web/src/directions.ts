import type { Category } from "@ks/core";
import { AirVent, Building2, Fan, Grid3x3, House, PaintRoller, ShowerHead, Zap, type LucideIcon } from "lucide-react";

/** Направления для сайта: порядок, значок и примеры работ. Названия — из CATEGORY_LABELS. */
export const DIRECTIONS: { category: Exclude<Category, "general">; Icon: LucideIcon; works: string[] }[] = [
  { category: "turnkey", Icon: House, works: ["Квартиры и дома", "Санузлы", "Офисы и магазины"] },
  { category: "finishing", Icon: PaintRoller, works: ["Штукатурка и шпаклёвка", "Покраска и обои", "Гипсокартон"] },
  { category: "floors", Icon: Grid3x3, works: ["Стяжка", "Ламинат и кварцвинил", "Плитка на пол и стены"] },
  { category: "facade", Icon: Building2, works: ["Штукатурка и покраска", "Утепление", "Межпанельные швы"] },
  { category: "electric", Icon: Zap, works: ["Замена проводки", "Щиты, автоматы, УЗО", "Розетки и свет"] },
  { category: "plumbing", Icon: ShowerHead, works: ["Разводка труб", "Радиаторы отопления", "Сантехприборы"] },
  { category: "climate", Icon: AirVent, works: ["Продажа и монтаж", "Чистка и ТО", "Заправка фреоном"] },
  { category: "vent", Icon: Fan, works: ["Вытяжные вентиляторы", "Воздуховоды", "Приточные клапаны"] },
];
