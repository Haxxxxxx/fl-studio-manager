# FL Manager / Music Command Center

Desktop app (Tauri 2 + Rust backend, React 19 + TS + Zustand + Tailwind frontend) that reads FL Studio project folders for a five-person rap crew. Product vision, phases and principles: **[docs/ROADMAP.md](docs/ROADMAP.md)**. Read it before planning features.

## Where we are
- Phase 0 (stabilize + demo-ready) is nearly done. The remaining items are the crew pitch and scrubbing git history before the repo can go public.
- **Launch Kit** (Phase 1b) first slice is in: `src/lib/launchKit.ts` (generate, verify, export files), `src-tauri/src/audio.rs` (mixdown analysis and snippet clips), `src/components/LaunchKitView.tsx`. The kit is regenerated from the project every time; the workspace stores only user edits (`SongMeta.launchKit`).
- **Shorts** (free, local): `src/lib/shorts.ts` draws the 1080×1920 still layer on a canvas (generative art, title, artist, release pill), so ffmpeg needs no fonts. `src-tauri/src/shorts.rs` finds ffmpeg (setting, `FFMPEG_PATH`, PATH, Homebrew/WinGet folders), picks an H.264 encoder, and overlays a `showwaves` waveform plus the snippet audio. `WAVE_*` constants must match in both files. Keep `draw=full` on showwaves: the default makes the strokes about 6% opaque.
- The user wants a **fully free** stack in the released app: Gemini free tier for text, local ffmpeg for video, Cloudflare Workers AI (FLUX) for cover concepts. Claude (paid) is for development only, by the user's choice. Don't add paid APIs without asking.
- **Cover concepts:** FLUX.1 [schnell] on Cloudflare Workers AI (free 10k neurons/day). `src-tauri/src/cover.rs` holds the account ID + token (`cover.json` in the config dir, or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`), calls the model and saves `cover-concept.jpg` into the kit folder. `src/lib/cover.ts` turns the cover brief into a prompt: square, no text, no real likeness, no title or names. `src/components/CoverConcepts.tsx` is the 2x2 picker. Images stay in memory. The workspace stores only the pick's seed, prompt and saved path (`LaunchKitMeta.cover`).
- **AI layer:** two providers behind one structured call in `src-tauri/src/ai.rs`. **Gemini** (free tier, `generateContent` + `responseSchema`) is for release builds. **Claude** (Messages API, raw HTTP: Rust has no official SDK; `output_config.format` json_schema, effort `low`, no `temperature`, `fallbacks: "default"` on Opus 5.5) is for dev builds. Settings `aiProvider` is auto/gemini/claude, and auto = `cfg!(debug_assertions)` → Claude. Keys live in `ai.json` (`gemini_api_key`, `anthropic_api_key`) or the `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` env vars. Schemas are written Gemini-style (`OBJECT`); `to_json_schema` converts them for Claude. One call has a 2-minute cap. `src/lib/ai.ts` holds the prompts: `draftCopy` (captions + cover concept) and `reviewKit` (a verdict, confidence and suggestion for every field). `sanitizeReview` drops suggestions for measured fields (bpm, duration) and malformed values; never trust raw model output. The AI is optional: everything works without a key.
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
