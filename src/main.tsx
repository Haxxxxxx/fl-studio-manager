import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installDropGuard } from "./lib/dropGuard";

// A file dropped on the window must never replace the app (see dropGuard.ts).
installDropGuard();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
