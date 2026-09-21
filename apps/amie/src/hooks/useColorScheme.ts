import { useState } from "react";
import {
  applyColorScheme,
  cycleColorScheme,
  initColorScheme,
  type ColorScheme,
} from "../lib/color-scheme";

export function useColorScheme() {
  const [scheme, setScheme] = useState<ColorScheme>(() => initColorScheme());

  const toggleScheme = () => {
    setScheme((current) => {
      const next = cycleColorScheme(current);
      applyColorScheme(next);
      return next;
    });
  };

  return { scheme, toggleScheme };
}
