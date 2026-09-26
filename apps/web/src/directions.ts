import type { Category } from "@ks/core";
import { AirVent, Building2, Fan, Grid3x3, House, PaintRoller, ShowerHead, Zap, type LucideIcon } from "lucide-react";

/**
 * Направления для сайта: порядок, значок, примеры работ и главная позиция, цену которой показываем на карточке
 * (не самую дешёвую: «Ремонт под ключ от 350 ₽» за демонтаж ввёл бы клиента в заблуждение).
 */
export const DIRECTIONS: { category: Exclude<Category, "general">; Icon: LucideIcon; works: string[]; headline: { key: string; label: string } }[] = [
  { category: "turnkey", Icon: House, works: ["Квартиры и дома", "Санузлы", "Офисы и магазины"], headline: { key: "turnkey-cosmetic", label: "Косметический ремонт" } },
  { category: "finishing", Icon: PaintRoller, works: ["Штукатурка и шпаклёвка", "Покраска и обои", "Гипсокартон"], headline: { key: "finishing-putty", label: "Шпаклёвка" } },
  { category: "floors", Icon: Grid3x3, works: ["Стяжка", "Ламинат и кварцвинил", "Плитка на пол и стены"], headline: { key: "floors-tile", label: "Плитка" } },
  { category: "facade", Icon: Building2, works: ["Штукатурка и покраска", "Утепление", "Межпанельные швы"], headline: { key: "facade-plaster", label: "Штукатурка фасада" } },
  { category: "electric", Icon: Zap, works: ["Замена проводки", "Щиты, автоматы, УЗО", "Розетки и свет"], headline: { key: "electric-socket", label: "Розетка" } },
  { category: "plumbing", Icon: ShowerHead, works: ["Разводка труб", "Радиаторы отопления", "Сантехприборы"], headline: { key: "plumbing-mixer", label: "Смеситель" } },
  { category: "climate", Icon: AirVent, works: ["Продажа и монтаж", "Чистка и ТО", "Заправка фреоном"], headline: { key: "climate-mount-small", label: "Монтаж" } },
  { category: "vent", Icon: Fan, works: ["Вытяжные вентиляторы", "Воздуховоды", "Приточные клапаны"], headline: { key: "vent-fan", label: "Вентилятор" } },
];
