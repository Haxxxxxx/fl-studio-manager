// Tauri's CLI refuses to build when an npm package and its Rust crate are on
// different major.minor versions (@tauri-apps/api ↔ tauri, @tauri-apps/plugin-x
// ↔ tauri-plugin-x). CI runs `cargo test` and `vite build`, not `tauri build`,
// so this check catches the mismatch on a pull request instead of a release.
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const cargo = readFileSync(new URL("../src-tauri/Cargo.lock", import.meta.url), "utf8");

/** Every locked version of a crate (a crate can appear more than once). */
function crateVersions(name) {
  const re = new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${name}"\\r?\\nversion = "([^"]+)"`, "g");
  return [...cargo.matchAll(re)].map((m) => m[1]);
}
const minor = (v) => v.split(".").slice(0, 2).join(".");

// @tauri-apps/cli has no crate of its own: it must match the tauri crate.
const pairs = [
  ["@tauri-apps/api", "tauri"],
  ["@tauri-apps/cli", "tauri"],
];
for (const path of Object.keys(lock.packages)) {
  const m = path.match(/^node_modules\/@tauri-apps\/plugin-(.+)$/);
  if (m) pairs.push([`@tauri-apps/plugin-${m[1]}`, `tauri-plugin-${m[1]}`]);
}

let bad = 0;
for (const [npmName, crate] of pairs) {
  const npmVersion = lock.packages[`node_modules/${npmName}`]?.version;
  if (!npmVersion) continue;
  const crates = crateVersions(crate);
  if (crates.length === 0) {
    console.error(`${npmName} ${npmVersion} is installed but no ${crate} crate is in src-tauri/Cargo.lock (add the crate or drop the package)`);
    bad++;
    continue;
  }
  if (!crates.some((v) => minor(v) === minor(npmVersion))) {
    console.error(`${npmName} ${npmVersion} does not match ${crate} ${crates.join(", ")} (same major.minor needed)`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`tauri versions aligned (${pairs.length} pairs)`);
