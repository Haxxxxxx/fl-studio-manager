import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

/** The faces the hero uses (preloaded from index.html, see vite.config.ts). */
const HERO_FONTS = [
  '600 1em "Barlow Condensed"',
  '700 1em "Barlow Condensed"',
  '600 1em "Oswald"',
  '400 1em "IBM Plex Sans"',
  '600 1em "IBM Plex Sans"',
  '400 1em "IBM Plex Mono"',
];
/** Never hold the first paint longer than this for fonts. */
const FONT_WAIT_MS = 400;

const render = () =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

// First paint in the real fonts, not the fallback then a swap. They're
// already downloading (preloaded), so this is usually a few tens of ms.
const fontsReady = document.fonts ? Promise.all(HERO_FONTS.map((f) => document.fonts.load(f))).catch(() => undefined) : Promise.resolve();
void Promise.race([fontsReady, new Promise((r) => setTimeout(r, FONT_WAIT_MS))]).then(render);
