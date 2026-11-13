import type { ReactNode } from "react";
import type { ColorScheme } from "../lib/color-scheme";
import { COLOR_SCHEME_LABELS } from "../lib/color-scheme";
import {
  MoonThemeIcon,
  SunThemeIcon,
  SystemThemeIcon,
} from "./sidebar-icons";
import { SIDEBAR_ITEM } from "./sidebar-styles";
import { cn } from "../lib/cn";

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
      className={cn(SIDEBAR_ITEM, "text-[12px] hover:text-text-active")}
      onClick={onToggle}
      aria-label={`Color scheme: ${label}. Click to switch.`}
    >
      {THEME_ICONS[scheme]}
      <span className="min-w-0">{label}</span>
    </button>
  );
}
