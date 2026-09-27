# FL Manager

A native desktop app for browsing and batch-exporting your FL Studio projects. Point it at the folders where your `.flp` files live, and it gives you a searchable library plus one-click "export all" that renders full mixdowns via FL Studio's own command-line renderer.

Built with [Tauri](https://tauri.app) (Rust) + React/TypeScript.

## Features

- **Dashboard** — stat tiles (project count, total size, folders linked, favorites) plus charts: projects by folder, projects by type (genre), and edit activity over the last 10 weeks.
- **Library** — recursively scans linked folders for `.flp` projects, with search, sortable columns (name/modified/size/genre/BPM), per-folder and per-type (genre) filter chips, and a favorites toggle.
- **Real project metadata** — genre, artist, tempo (BPM), time signature, and FL Studio version are read directly out of each `.flp` file (see caveat below), so filtering by "type" reflects what's actually set in FL Studio's own Project Info dialog, not just folder location.
- **Batch export** — select any number of projects and render them all to WAV/MP3/OGG in one go, with live per-project progress.
- **Open / reveal** — jump straight into FL Studio, or reveal a project in Finder/Explorer.
- **Sample data** — one click (Dashboard, Library, or Settings) loads ~28 generated projects across 4 folders so you can see the whole UI populated without linking a real folder first. Export is disabled while viewing sample data.
- Settings for FL Studio path (with auto-detect), output folder, export format, and favorites (persisted).

## Getting started

```bash
npm install
npm run tauri dev      # launch in development
npm run tauri build    # produce a distributable app
```

Requires Node.js and the Rust toolchain (`rustup`) installed — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for platform-specific setup (Xcode CLT on macOS, Build Tools + WebView2 on Windows).

## How export works — read this before batch-exporting

FL Studio does not have a public/first-party API for headless rendering. This app shells out to FL Studio's **command-line rendering flags** (`/R /E<format> /F<folder>`), which are real but only lightly and inconsistently documented by Image-Line — official docs have had known typos, and the most authoritative confirmations from Image-Line staff live behind a forum login wall. Behavior may vary by FL Studio version and OS (Windows support is better attested than macOS).

Practical implications:

- **Run a test render first.** Settings → Test render lets you render one project and confirm the output actually appears before trusting a big batch job.
- Each export stages a project's `.flp` in a private temp folder, invokes FL Studio's renderer against just that folder, then moves the result to your chosen output folder — this keeps batch renders isolated from each other and avoids clobbering unrelated files.
- FL Studio must be installed (with a valid license — command-line rendering exercises the same rendering engine as a normal export/bounce). It's best to close any open FL Studio windows before a batch run.
- If a project produces no output within 15 minutes, that project is marked failed and the batch moves on to the next one.
- This does **not** export individual mixer tracks/stems — only full project mixdowns. Per-track stem export isn't reliably exposed via the CLI.

## How "type" (genre) filtering works — read this too

`.flp` is Image-Line's closed, undocumented binary format. The metadata reader (`src-tauri/src/flp_metadata.rs`) is built from the byte-level format reverse-engineered by the open-source [PyFLP](https://github.com/demberto/PyFLP) project (header layout, event-ID encoding, the exact IDs for title/genre/artist/tempo/time-signature, and the ASCII-vs-UTF-16LE text encoding rule based on FL Studio version). It's covered by unit tests against synthetic `.flp` byte fixtures built to that same spec — but it has **not** been validated against a real FL Studio install, since none was available in the environment this was built in. Try it against your real projects and treat any mis-read field as a bug report waiting to happen.

Practical implications:

- **Genre/Artist are very often empty.** FL Studio doesn't require or default these — many projects will simply show "Unspecified." That's expected, not a bug.
- Reading is best-effort and defensive: a corrupt, unusual, or unrecognized `.flp` just shows up with no metadata rather than failing the whole scan.
- Reading metadata means the scanner now opens and partially reads every `.flp` file (not just `stat`s it). It stops early once it's found what it's looking for (title/tempo/time-signature/version, plus genre/artist if found within the first 256KB of the file's event stream), so this should still be fast even for large libraries — but it is slower than a pure filesystem scan.

## Project layout

```
src/                  React frontend
  components/         Dashboard, Library, Settings, Sidebar, render progress panel
  store/               Zustand app state
  lib/tauri.ts         Typed wrappers around Tauri commands
  lib/sampleData.ts     Generated sample-data set for demo mode
src-tauri/src/
  scanner.rs           Recursive .flp discovery
  flp_metadata.rs      Best-effort .flp binary metadata parser (genre/artist/tempo/etc), with unit tests
  render.rs            Render orchestration (staging, invoking FL Studio, collecting output)
  settings.rs          Settings persistence + FL Studio auto-detect
```

Run the parser's tests with `cd src-tauri && cargo test`.
