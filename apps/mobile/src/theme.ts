import { useColorScheme } from "react-native";

/** Цвета как у сайта (apps/web/src/styles.css): графит и сигнальный оранжевый. */
const light = {
  bg: "#f3f1ec",
  surface: "#ffffff",
  surface2: "#ebe8e1",
  text: "#141619",
  muted: "#5b6068",
  line: "#dcd8d0",
  accent: "#d9480f",
  accentText: "#ffffff",
  accentSoft: "#f7e4da",
  success: "#2f7d32",
  successSoft: "#e2f0e2",
  info: "#1f5fa8",
  infoSoft: "#e2ecf8",
  danger: "#c62828",
  dangerSoft: "#fbe3e3",
  graphite: "#17191c",
  graphiteText: "#f3f1ec",
  graphiteMuted: "#a3a7ae",
};

const dark: typeof light = {
  bg: "#0f1012",
  surface: "#17191c",
  surface2: "#1e2024",
  text: "#f1efea",
  muted: "#a0a4ab",
  line: "#2a2d32",
  accent: "#d9480f",
  accentText: "#ffffff",
  accentSoft: "#2a1a12",
  success: "#5fb862",
  successSoft: "#152619",
  info: "#6aa6e8",
  infoSoft: "#14202e",
  danger: "#ef6b6b",
  dangerSoft: "#2c1515",
  graphite: "#1e2125",
  graphiteText: "#f3f1ec",
  graphiteMuted: "#a3a7ae",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
