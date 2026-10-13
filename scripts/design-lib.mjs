// Packages src/ui (the app's UI library) the way the Claude Design sync
// expects a design system: a named package with an entry, .d.ts types and a
// stylesheet. Output goes to .design-sync/lib/ (generated, git-ignored).
// Run after `npm run build` (the stylesheet is the app's compiled Tailwind CSS).
//   npm run build && node scripts/design-lib.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = ".design-sync/lib";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Types for the public surface (and what it imports), via the repo's own tsc.
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc",
    "--project", "tsconfig.json",
    "--noEmit", "false",
    "--declaration",
    "--emitDeclarationOnly",
    "--allowImportingTsExtensions", "false",
    "--rootDir", "src",
    "--outDir", join(OUT, "types"),
  ],
  { stdio: "inherit" },
);

// The compiled app stylesheet: every Tailwind class the components use.
const assets = "dist/assets";
const css = readdirSync(assets).find((f) => /^index-.*\.css$/.test(f));
if (!css) throw new Error("no compiled stylesheet in dist/assets: run `npm run build` first");
// The bundled fonts (Barlow Condensed, IBM Plex, Oswald via @fontsource) are
// referenced as /assets/<file>: ship the files next to the stylesheet and
// point the @font-face urls at them, so designs render in the real faces.
const fonts = readdirSync(assets).filter((f) => /\.(woff2?|ttf|otf)$/.test(f));
for (const f of fonts) copyFileSync(join(assets, f), join(OUT, f));
const styles = readFileSync(join(assets, css), "utf8").replace(/url\(\/assets\/([^)]+\.(?:woff2?|ttf|otf))\)/g, "url(./$1)");
writeFileSync(join(OUT, "styles.css"), styles);

// The entry lives inside the package (the sync finds the package by walking up
// from it) and re-exports the real source.
writeFileSync(join(OUT, "index.ts"), 'export * from "../../src/ui/index";\n');

writeFileSync(
  join(OUT, "package.json"),
  JSON.stringify(
    {
      name: "fl-manager-ui",
      version: "0.1.0",
      private: true,
      description: "Hivo's UI library (src/ui), packaged for the Claude Design sync",
      module: "index.ts",
      types: "types/ui/index.d.ts",
      style: "styles.css",
    },
    null,
    2,
  ) + "\n",
);
console.log(`design lib ready in ${OUT} (styles from ${css}, ${fonts.length} font files)`);
