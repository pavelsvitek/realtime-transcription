import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
// Tokens and Tailwind load before App.css, which still holds the component styles.
import "./styles.css";
import App from "./App";
import { initColorScheme } from "./lib/color-scheme";
import { createQueryClient } from "./lib/query-client";

initColorScheme();

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
