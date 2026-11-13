import type { ReactNode } from "react";

type TitleBarProps = {
  children?: ReactNode;
};

/**
 * macOS overlay title bar region — sits under the native traffic lights.
 * Put interactive controls (search, buttons) in `children`; empty space drags the window.
 */
export function TitleBar({ children }: TitleBarProps) {
  return (
    <header className="flex h-[var(--window-chrome-top)] shrink-0 items-center gap-2 bg-surface-chrome">
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
      <div className="min-w-0 flex-1 self-stretch" data-tauri-drag-region />
    </header>
  );
}
