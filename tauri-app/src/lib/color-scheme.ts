export type ColorScheme = "system" | "light" | "dark";

const STORAGE_KEY = "color-scheme";

const CYCLE_ORDER: ColorScheme[] = ["system", "light", "dark"];

export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function getStoredColorScheme(): ColorScheme {
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

export function applyColorScheme(scheme: ColorScheme): void {
  document.documentElement.setAttribute("data-theme", scheme);
  localStorage.setItem(STORAGE_KEY, scheme);
}

export function cycleColorScheme(current: ColorScheme): ColorScheme {
  const index = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(index + 1) % CYCLE_ORDER.length];
}

export function initColorScheme(): ColorScheme {
  const scheme = getStoredColorScheme();
  applyColorScheme(scheme);
  return scheme;
}
