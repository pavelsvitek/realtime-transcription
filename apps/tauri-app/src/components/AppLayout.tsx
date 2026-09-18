import type { ReactNode } from "react";
import { Sidebar, type AppPage } from "./Sidebar";
import { TitleBar } from "./TitleBar";

interface AppLayoutProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  children: ReactNode;
}

export function AppLayout({ currentPage, onNavigate, children }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <div className="app-main">
        <TitleBar>

        </TitleBar>
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
