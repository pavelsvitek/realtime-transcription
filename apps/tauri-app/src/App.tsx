import { useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import "./App.css";

function renderPage(page: AppPage) {
  switch (page) {
    case "home":
      return <HomePage />;
    case "transcribe":
      return <TranscribePage />;
    case "meetings":
      return <MeetingsPage />;
    case "settings":
      return <SettingsPage />;
  }
}

function App() {
  const [page, setPage] = useState<AppPage>("transcribe");

  return (
    <AppLayout currentPage={page} onNavigate={setPage}>
      {renderPage(page)}
    </AppLayout>
  );
}

export default App;
