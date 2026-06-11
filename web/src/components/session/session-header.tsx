import type { ReactNode } from "react";
import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SessionHeaderProps = {
  mode: string;
  elapsed: string;
  controls?: ReactNode;
  onFinish?: () => void;
};

export function SessionHeader({
  mode,
  elapsed,
  controls,
  onFinish,
}: SessionHeaderProps) {
  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border bg-background px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-foreground">Live session</span>
        </div>
        <Badge variant="secondary">{mode}</Badge>
        <span className="text-xs text-muted-foreground">{elapsed}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {controls}
        <ThemeSwitch />
        <Button type="button" variant="outline" onClick={onFinish}>
          Finish session
        </Button>
      </div>
    </header>
  );
}
