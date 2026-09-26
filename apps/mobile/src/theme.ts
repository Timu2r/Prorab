import { useColorScheme } from "react-native";

const light = {
  bg: "#f3f1ec",
  surface: "#ffffff",
  text: "#141619",
  muted: "#5b6068",
  line: "#dcd8d0",
  accent: "#d9480f",
  accentText: "#ffffff",
  accentSoft: "#f7e4da",
  danger: "#c62828",
};

const dark: typeof light = {
  bg: "#0f1012",
  surface: "#17191c",
  text: "#f1efea",
  muted: "#a0a4ab",
  line: "#2a2d32",
  accent: "#d9480f",
  accentText: "#ffffff",
  accentSoft: "#2a1a12",
  danger: "#ef6b6b",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
