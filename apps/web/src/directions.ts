import { CATEGORY_WORKS, HEADLINE_SERVICES, type Category } from "@ks/core";
import { AirVent, Building2, Fan, Grid3x3, House, PaintRoller, ShowerHead, Zap, type LucideIcon } from "lucide-react";

type Direction = Exclude<Category, "general">;

const ICONS: Record<Direction, LucideIcon> = {
  turnkey: House,
  finishing: PaintRoller,
  floors: Grid3x3,
  facade: Building2,
  electric: Zap,
  plumbing: ShowerHead,
  climate: AirVent,
  vent: Fan,
};

/** Направления для сайта: порядок, значок, примеры работ и главная позиция (общие данные — в @ks/core). */
export const DIRECTIONS = (Object.keys(ICONS) as Direction[]).map((category) => ({
  category,
  Icon: ICONS[category],
  works: CATEGORY_WORKS[category],
  headline: HEADLINE_SERVICES[category],
}));
