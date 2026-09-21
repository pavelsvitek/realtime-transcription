import type { ReactNode } from "react";
import type { ColorScheme } from "../lib/color-scheme";
import { COLOR_SCHEME_LABELS } from "../lib/color-scheme";
import {
  MoonThemeIcon,
  SunThemeIcon,
  SystemThemeIcon,
} from "./sidebar-icons";

type ThemeToggleProps = {
  scheme: ColorScheme;
  onToggle: () => void;
};

const THEME_ICONS: Record<ColorScheme, ReactNode> = {
  system: <SystemThemeIcon />,
  light: <SunThemeIcon />,
  dark: <MoonThemeIcon />,
};

export function ThemeToggle({ scheme, onToggle }: ThemeToggleProps) {
  const label = COLOR_SCHEME_LABELS[scheme];

  return (
    <button
      type="button"
      className="sidebar-theme-toggle"
      onClick={onToggle}
      aria-label={`Color scheme: ${label}. Click to switch.`}
    >
      {THEME_ICONS[scheme]}
      <span className="sidebar-theme-toggle-label">{label}</span>
    </button>
  );
}
