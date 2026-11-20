import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles.css";
import App from "./App";
import { initColorScheme } from "./lib/color-scheme";
import { createQueryClient } from "./lib/query-client";
import { getAllMeetingsQueryOptions } from "./models/Meeting";

initColorScheme();

const queryClient = createQueryClient();

// Load the meetings list before the user opens that page.
void queryClient.prefetchQuery(getAllMeetingsQueryOptions());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
