import { defineConfig } from "vitest/config";

// Unit tests for the pure modules in src/lib (no React Native in here).
export default defineConfig({
  test: { include: ["src/lib/**/*.test.ts"], environment: "node" },
});
