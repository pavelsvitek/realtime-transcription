import { useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import "./App.css";

function renderPage(
  page: AppPage,
  startRequestId: number,
  onStartRequestHandled: () => void,
) {
  switch (page) {
    case "home":
      return <HomePage />;
    case "transcribe":
      return (
        <TranscribePage
          startRequestId={startRequestId}
          onStartRequestHandled={onStartRequestHandled}
        />
      );
    case "meetings":
      return <MeetingsPage />;
    case "settings":
      return <SettingsPage />;
  }
}

function App() {
  const [page, setPage] = useState<AppPage>("transcribe");
  const [startRequestId, setStartRequestId] = useState(0);

  return (
    <AppLayout
      currentPage={page}
      onNavigate={setPage}
      onStartMeeting={() => {
        setPage("transcribe");
        setStartRequestId((id) => id + 1);
      }}
    >
      {renderPage(page, startRequestId, () => setStartRequestId(0))}
    </AppLayout>
  );
}

export default App;
