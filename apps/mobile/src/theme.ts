import { useColorScheme } from "react-native";

const light = {
  bg: "#f6f7f9",
  surface: "#ffffff",
  text: "#14171c",
  muted: "#5d6573",
  line: "#e2e5ea",
  accent: "#0b6bcb",
  accentText: "#ffffff",
  accentSoft: "#e7f1fb",
  danger: "#c62828",
};

const dark: typeof light = {
  bg: "#0f1115",
  surface: "#171a20",
  text: "#eef0f3",
  muted: "#9aa3b2",
  line: "#262a33",
  accent: "#4c9eea",
  accentText: "#0b0d10",
  accentSoft: "#15283b",
  danger: "#ef6b6b",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
