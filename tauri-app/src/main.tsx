import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initColorScheme } from "./lib/color-scheme";

initColorScheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
