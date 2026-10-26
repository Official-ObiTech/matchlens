import { useColorScheme } from "react-native";

/** Mirrors the web tokens in apps/web/src/app/globals.css. */
const light = {
  bg: "#f4f6f8",
  surface: "#ffffff",
  surface2: "#eef1f4",
  border: "#dde3e9",
  text: "#0f1b2a",
  text2: "#4a5a6c",
  text3: "#7a8796",
  accent: "#0b7a53",
  accentInk: "#ffffff",
  accentSoft: "#e2f3ec",
  warnSoft: "#fff4dc",
  danger: "#b42318",
  dangerSoft: "#fdecea",
  infoSoft: "#e8f0fb",
  win: "#0b7a53",
  loss: "#b42318",
  void: "#6b7785",
  q: { A: "#0b7a53", B: "#3a7d1f", C: "#9a6200", D: "#b42318" },
};

const dark: typeof light = {
  bg: "#0a111b",
  surface: "#111b28",
  surface2: "#172434",
  border: "#233347",
  text: "#e8eef5",
  text2: "#a9b6c4",
  text3: "#7b8a9b",
  accent: "#2fbf86",
  accentInk: "#04140d",
  accentSoft: "#0f2d22",
  warnSoft: "#2c2210",
  danger: "#f2766b",
  dangerSoft: "#2f1614",
  infoSoft: "#14243a",
  win: "#2fbf86",
  loss: "#f2766b",
  void: "#8d99a6",
  q: { A: "#2fbf86", B: "#8ccf5a", C: "#f2b24c", D: "#f2766b" },
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const radius = { md: 14, sm: 10, pill: 999 };
export const space = (n: number) => n * 4;
