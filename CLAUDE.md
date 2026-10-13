# FL Manager / Music Command Center

Desktop app (Tauri 2 + Rust backend, React 19 + TS + Zustand + Tailwind frontend) that reads FL Studio project folders for a five-person rap crew. Product vision, phases and principles: **[docs/ROADMAP.md](docs/ROADMAP.md)**. Read it before planning features.

## Where we are
- Phase 0 (stabilize + demo-ready) is nearly done. The remaining items are the crew pitch and scrubbing git history before the repo can go public.
- **Launch Kit** (Phase 1b) first slice is in: `src/lib/launchKit.ts` (generate, verify, export files), `src-tauri/src/audio.rs` (mixdown analysis and snippet clips), `src/components/LaunchKitView.tsx`. The kit is regenerated from the project every time; the workspace stores only user edits (`SongMeta.launchKit`).
- **AI layer:** Gemini API free tier (no Firebase project exists for this app). `src-tauri/src/ai.rs` holds the key (`ai.json` in the config dir, or the `GEMINI_API_KEY` env var) and makes one generic structured call (`generateContent` + `responseSchema`). `src/lib/ai.ts` holds the prompts: `draftCopy` (captions + cover concept) and `reviewKit` (a verdict, confidence and suggestion for every field). `sanitizeReview` drops suggestions for measured fields (bpm, duration) and malformed values; never trust raw model output. The AI is optional: everything works without a key.
- **Shorts** (free, local): `src/lib/shorts.ts` draws the 1080×1920 still layer on a canvas (generative art, title, artist, release pill), so ffmpeg needs no fonts. `src-tauri/src/shorts.rs` finds ffmpeg (setting, `FFMPEG_PATH`, PATH, Homebrew/WinGet folders), picks an H.264 encoder, and overlays a `showwaves` waveform plus the snippet audio. `WAVE_*` constants must match in both files. Keep `draw=full` on showwaves: the default makes the strokes about 6% opaque.
- The user wants a **fully free** stack: Gemini free tier for text, local ffmpeg for video, Cloudflare Workers AI (FLUX) for cover concepts. Don't add paid APIs without asking.
- Not built yet: stems, and distributor-specific export formats. The shared crew dashboard (1a) needs a backend decision first.

## Commands
- `npm ci && npm run tauri dev`: run the app. Setup per OS: [SETUP.md](SETUP.md).
- `npm run build`: tsc + vite (must stay clean).
- `cd src-tauri && cargo test`: Rust tests.

## Rules
- Developed on Windows and macOS. Crew members use both. `.flp` files store paths with the saving OS's separators (see `native()` in `src-tauri/src/resolve.rs`).
- No hardcoded paths, usernames, real artist names or keys in code, tests or docs. Use placeholders.
- App data (statuses, releases, people) lives in `workspace.json` in the app config dir, keyed by `.flp` path. Never write to `.flp` files.
- Song stages in code (`idea → wip → mixing → mastering → done`) don't yet match the roadmap lifecycle (Creation → Production → Prep → Release → Promotion). Migrate them deliberately, with a workspace migration.
