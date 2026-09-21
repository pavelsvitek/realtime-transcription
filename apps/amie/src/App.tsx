import { useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import "./App.css";

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
      {page === "home" ? <HomePage /> : null}
      <div className="app-page-slot" hidden={page !== "transcribe"}>
        <TranscribePage
          startRequestId={startRequestId}
          onStartRequestHandled={() => setStartRequestId(0)}
        />
      </div>
      {page === "meetings" ? <MeetingsPage /> : null}
      {page === "settings" ? <SettingsPage /> : null}
    </AppLayout>
  );
}

export default App;
