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
    <header className="titlebar">
      {children ? (
        <div className="titlebar-controls">{children}</div>
      ) : null}
      <div className="titlebar-drag" data-tauri-drag-region />
    </header>
  );
}
