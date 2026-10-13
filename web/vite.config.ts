import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** The faces the landing's first screen (the hero) uses, latin subset.
 * Others (Plex Mono 500 further down, Plex Sans 500 after sign-in) load on
 * demand, where a late swap isn't visible. */
const FIRST_SCREEN_FONTS = [
  "barlow-condensed-latin-600",
  "barlow-condensed-latin-700",
  "oswald-latin-600",
  "ibm-plex-sans-latin-400",
  "ibm-plex-sans-latin-600",
  "ibm-plex-mono-latin-400",
];

/** Preload the first screen's fonts, so they download alongside the
 * stylesheet instead of after it, arrive together, and text swaps from the
 * fallback at most once. */
function preloadFonts(): Plugin {
  return {
    name: "preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) =>
          FIRST_SCREEN_FONTS.some((name) => new RegExp(`/${name}-normal-[\\w-]+\\.woff2$`).test(f)),
        );
        return files.map((f) => ({
          tag: "link",
          attrs: { rel: "preload", href: `/${f}`, as: "font", type: "font/woff2", crossorigin: "" },
          injectTo: "head-prepend" as const,
        }));
      },
    },
  };
}

// The crew web dashboard. Shares pure modules with the desktop app through
// @shared (types, stages, formatting); nothing that imports packages.
export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: { port: 5175, strictPort: true },
});
