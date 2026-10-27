import React from "react";
import ReactDOM from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import App from "./App";
import { SessionWindow } from "./components/SessionWindow";
import "./index.css";
import { installDropGuard } from "./lib/dropGuard";

// A file dropped on the window must never replace the app (see dropGuard.ts).
installDropGuard();

// The session view (src-tauri/src/session.rs) loads the same bundle in its
// own window: it renders only the teleprompter, never the app's stores.
const isSession = isTauri() && getCurrentWebviewWindow().label === "session";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isSession ? <SessionWindow /> : <App />}</React.StrictMode>,
);
