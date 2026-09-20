import type { ReactNode } from "react";
import { useNavHotkeys } from "../hooks/useNavHotkeys";
import { Sidebar, type AppPage } from "./Sidebar";
import { TitleBar } from "./TitleBar";

interface AppLayoutProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  children: ReactNode;
}

export function AppLayout({ currentPage, onNavigate, children }: AppLayoutProps) {
  useNavHotkeys(onNavigate);

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
