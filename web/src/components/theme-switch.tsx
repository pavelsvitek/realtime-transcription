"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" disabled aria-label="Light theme">
          <Sun />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled aria-label="Dark theme">
          <Moon />
        </Button>
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Light theme"
        aria-pressed={!isDark}
        onClick={() => setTheme("light")}
        className={cn(!isDark && "bg-muted text-foreground")}
      >
        <Sun />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dark theme"
        aria-pressed={isDark}
        onClick={() => setTheme("dark")}
        className={cn(isDark && "bg-muted text-foreground")}
      >
        <Moon />
      </Button>
    </div>
  );
}
