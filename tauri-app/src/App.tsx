import { useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { TranscribePage } from "./pages/TranscribePage";
import "./App.css";

function App() {
  const [page, setPage] = useState<AppPage>("transcribe");

  return (
    <AppLayout currentPage={page} onNavigate={setPage}>
      {page === "home" ? <HomePage /> : <TranscribePage />}
    </AppLayout>
  );
}

export default App;
