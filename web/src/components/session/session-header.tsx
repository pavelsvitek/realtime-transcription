import type { ReactNode } from "react";

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
    <header className="flex shrink-0 flex-col gap-3 border-b border-stone-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-stone-800">Live session</span>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
          {mode}
        </span>
        <span className="text-xs text-stone-500">{elapsed}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {controls}
        <button
          type="button"
          onClick={onFinish}
          className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
        >
          Finish session
        </button>
      </div>
    </header>
  );
}
