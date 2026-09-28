# FL Manager

A native desktop studio manager for FL Studio. Point it at your projects folder and it organizes your songs — pipeline stages, tags, notes, albums/EPs — shows what you've actually been working on, and creates, versions and batch-renders projects via FL Studio itself.

Built with [Tauri](https://tauri.app) (Rust) + React/TypeScript.

## Features

- **Songs, not files** — one entry per song. FL's auto-backups (`Backup/<song> (overwritten at 16h12).flp`) are grouped under their song instead of flooding the list; mixdowns next to the `.flp` and recorded takes in `Audio/` are attached too. `Templates/` projects are hidden unless toggled on.
- **Will it open on this PC?** — every sample path and plugin is read from each `.flp`. Samples are classified *found* / *moved* (not at the stored path but present by name in the song's folder, typical after moving a project — FL usually relocates these) / *missing*. Third-party plugins (hosted by Fruity Wrapper) are checked against the standard VST3/CLAP/VST2 folders and FL's own plugin path, matched by name too, so projects saved on another PC with different plugin paths still resolve. Songs that won't open cleanly get a warning in the Library and an Issues filter.
- **Plugin toolkit** — which plugins you actually use and in how many songs (CLAP/VST3 name variants merged); click one to list those songs. Search also matches plugin names.
- **Mixdowns** — found next to the `.flp` *and* in the export folder (incl. subfolders, `03 - Title` release numbering), with in-app playback; the library rescans after every export and when you switch back from FL.
- **Package (zipped loop package)** — zip a song, a selection, or a whole release with every sample it uses, in the same flat layout as FL's File → Export → Zipped loop package (FL opens it directly and relinks samples by name). Moved samples are picked up from their new location; samples that can't be found are listed. Goes to `<export folder>\Packages[\<release>]`. For collabs, mix engineers, and archiving.
- **People, credits & pitches** — collaborators/contacts with aliases (BQ = Brea-Q). The scanner collects each song's mixer track names and recorded-take labels (FL names takes after the mixer track, e.g. `Lead Voices - Brea-Q`), so the app detects who's on which song and suggests names found in your sessions. Credit people per song (role + split %), and log beats sent to someone (date, outcome: sent → listened → interested → placed/sold, or passed); the dashboard lists sends with no answer after 14 days and your wins.
- **Key from track names** — keys you've written into a mixer track ("E MAJOR", "B♭ minor - 102") are suggested as the song's key.
- **Key & archive** — set a key per song (sortable column, shown in release tracklists); archive songs to hide them from the library, board and stats without touching files (the yearly clear-out), with an Archived view to bring them back.
- **Library** — search across names, tags, notes, keys, plugins and sample file names ("which songs use this sample?"); filter by stage and tag; sort by status/BPM/last save/backup count; bulk set status, add to a release, or export.
- **Pipeline** — kanban board (Unsorted → Idea → In progress → Mixing → Mastering → Done); drag songs between stages.
- **Releases** — albums, EPs, mixtapes and singles with an ordered tracklist, release date countdown, progress by stage, BPM range, notes, and **Export release** (renders every track, numbered `01 - Title`, into `<export folder>/<release>`).
- **Song panel** — status, tags, notes, releases, tempo/time-sig/FL version, in-app playback of the latest mixdown (flagged when the project was saved after it), **Save as new version**, a backup timeline with non-destructive **Restore** (copies the backup next to the project as `<song> - restored 16h12.flp`), and **Clean up** of older backups (keeps the 5 newest, moves the rest to the Recycle Bin).
- **New song** — from your own templates or FL's factory templates (defaults to the one FL uses for File → New), laid out FL-style as `<folder>/<Name>/<Name>.flp`, optionally added to a release, then opened in FL Studio.
- **Dashboard** — a 12-month activity heatmap built from save/backup timestamps (every backup is a real work session), pipeline breakdown, tempo distribution, storage split (project files / backups / recordings / mixdowns) with the biggest backup hogs, mixdowns that are out of date, and release progress.
- **Sample data** — a generated library + workspace to explore every view without linking a folder. Edits aren't saved and export is disabled.

Statuses, tags, notes and releases are the app's own data (FL doesn't store them) and live in `workspace.json` next to `settings.json` in the app config folder (`%APPDATA%\com.theiaweb.flstudiomanager` on Windows). They're keyed by `.flp` path, so renaming or moving a project outside the app detaches them (a release shows the track as missing rather than dropping it).

## Getting started

```bash
npm install
npm run tauri dev      # launch in development
npm run tauri build    # produce a distributable app
```

Requires Node.js ≥ 20.19 (Vite 8) and the Rust toolchain (`rustup`) — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) for platform-specific setup (Xcode CLT on macOS, Build Tools + WebView2 on Windows). If `npm install` was run on another OS, delete `node_modules` and reinstall so the native bundler binary for this platform gets installed.

On Windows the FL Studio path is auto-detected from the registry key FL's installer writes (`HKLM\SOFTWARE\Image-Line\Shared\Paths`), so custom install locations work.

## How export works — read this before batch-exporting

FL Studio does not have a public/first-party API for headless rendering. This app shells out to FL Studio's **command-line rendering flags** (`/R /E<format> /F<folder>`), which are real but only lightly documented by Image-Line. Verified on Windows with FL Studio 2025 (25.1.6): a ~85 KB project rendered to a 40 MB WAV in about a minute, exit code 0. Other versions and macOS are untested.

Practical implications:

- **Run a test render first.** Settings → Test render lets you render one project and confirm the output actually appears before trusting a big batch job.
- Each export stages a project's `.flp` in a private temp folder, invokes FL Studio's renderer against just that folder, then moves the result to your chosen output folder — this keeps batch renders isolated from each other and avoids clobbering unrelated files.
- FL Studio must be installed (with a valid license — command-line rendering exercises the same rendering engine as a normal export/bounce). It's best to close any open FL Studio windows before a batch run.
- If a project produces no output within 15 minutes, that project is marked failed and the batch moves on to the next one.
- This does **not** export individual mixer tracks/stems — only full project mixdowns. Per-track stem export isn't reliably exposed via the CLI.

## Reading .flp metadata

`.flp` is Image-Line's closed, undocumented binary format. The metadata reader (`src-tauri/src/flp_metadata.rs`) is built from the byte-level format reverse-engineered by the open-source [PyFLP](https://github.com/demberto/PyFLP) project. It reads tempo/time signature/version, every sample path (event 196), plugin internal names (201) and — for third-party plugins — the name/path/vendor records inside Fruity Wrapper's data blob (213; record IDs 54/55/56). Unit-tested against synthetic fixtures and validated against 59 real projects saved by FL Studio 24.2 and 25.1 — every one parses cleanly to the end of its event stream.

Practical implications:

- **Genre/Artist/Title are usually empty.** FL stores them as empty strings unless you fill in Project Info; they come back as null. That's why organization is done with the app's own stages, tags and releases instead.
- Tempo outside FL's 10–522 BPM range (seen in the wild: 522055 BPM in "3/1") is treated as garbage and dropped along with the time signature.
- Reading is best-effort and defensive: a corrupt, unusual, or unrecognized `.flp` just shows up with no metadata rather than failing the whole scan.
- Reading metadata means the scanner now opens and partially reads every `.flp` file (not just `stat`s it). It stops early once it's found what it's looking for (title/tempo/time-signature/version, plus genre/artist if found within the first 256KB of the file's event stream), so this should still be fast even for large libraries — but it is slower than a pure filesystem scan.

## Project layout

```
src/                   React frontend
  components/          Dashboard, Library, Pipeline, Albums (releases), ProjectDrawer,
                       NewProjectModal, Settings, Sidebar, RenderPanel, ui (shared bits)
  store/               Zustand app state (settings, workspace, actions)
  lib/songs.ts         Stage definitions/colors and derived song info
  lib/tauri.ts         Typed wrappers around Tauri commands
  lib/sampleData.ts    Generated sample library + workspace for demo mode
src-tauri/src/
  scanner.rs           .flp discovery; groups backups, mixdowns and recordings per song
  resolve.rs           Sample path / plugin install checks (what exists on this machine)
  package.rs           Zipped loop packages (.flp + samples)
  flp_metadata.rs      Best-effort .flp binary metadata parser
  actions.rs           Create from template, save as version, restore/clean up backups
  workspace.rs         Persistence for stages, tags, notes, releases
  render.rs            Render orchestration (staging, invoking FL Studio, collecting output)
  settings.rs          Settings persistence + FL Studio auto-detect
```

Run the tests with `cd src-tauri && cargo test`. To also run the parser and scanner over a real projects folder:

```bash
FLSM_REAL_PROJECTS="D:\path\to\FL Studio\Projects" cargo test -- --nocapture real
```
