import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The crew web dashboard. Shares pure modules with the desktop app through
// @shared (types, stages, formatting); nothing that imports packages.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  server: { port: 5175, strictPort: true },
});
