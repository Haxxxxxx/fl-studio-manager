# FL Manager / Music Command Center

Desktop app (Tauri 2 + Rust backend, React 19 + TS + Zustand + Tailwind frontend) that reads FL Studio project folders for a five-person rap crew. Product vision, phases and principles: **[docs/ROADMAP.md](docs/ROADMAP.md)**. Read it before planning features.

## Where we are
- Phase 0 (stabilize + demo-ready) is nearly done. The remaining items are the crew pitch and scrubbing git history before the repo can go public.
- Next big feature: the **Launch Kit** (Phase 1b), the demo moment. The shared crew dashboard (1a) needs a backend decision first.

## Commands
- `npm ci && npm run tauri dev`: run the app. Setup per OS: [SETUP.md](SETUP.md).
- `npm run build`: tsc + vite (must stay clean).
- `cd src-tauri && cargo test`: Rust tests.

## Rules
- Developed on Windows and macOS. Crew members use both. `.flp` files store paths with the saving OS's separators (see `native()` in `src-tauri/src/resolve.rs`).
- No hardcoded paths, usernames, real artist names or keys in code, tests or docs. Use placeholders.
- App data (statuses, releases, people) lives in `workspace.json` in the app config dir, keyed by `.flp` path. Never write to `.flp` files.
- Song stages in code (`idea → wip → mixing → mastering → done`) don't yet match the roadmap lifecycle (Creation → Production → Prep → Release → Promotion). Migrate them deliberately, with a workspace migration.
