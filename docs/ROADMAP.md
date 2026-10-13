# Hivo (formerly FL Manager): Roadmap and status

> Status as of **13 October 2026, evening**. This replaces the original vision document: the vision and principles are kept, and every feature now says where it stands. Written to be read aloud or pasted into a chat.

---

## 1. Where we are, in one minute

- **What it is.** A desktop app (Mac and Windows) that watches the crew's music project folders and follows every song from the first session to release and promotion. It comes with a web dashboard for the crew.
- **The name.** The app is now **Hivo** (formerly FL Manager), with a hive-cell logo. The rename is merged, the website shows it, and so do the sign-in emails.
- **Installers.** Mac and Windows installers exist: built locally and saved in the private repo's GitHub releases (latest: `desktop-0.1.0-r2`). The automatic cloud build is still blocked.
- **Phase 0 (stabilize, demo-ready).** Done, except two things: the crew pitch, and cleaning the git history before the repo can go public.
- **Phase 1 (crew dashboard, Launch Kit, design identity).** Built and merged.
- **Phase 2 (plugins, hardware, social publishing, distributor integrations).** Not started; ideas only.
- **Biggest blockers today:**
  - reliable sign-in emails need a mail provider and a domain;
  - the repo can't go public until the history scrub;
  - automatic installer builds are stuck behind a GitHub billing issue. Installers can still be built by hand on a Mac.

---

## 2. State of the codebase

- **Main branch** is green. Everything below marked "ready" is merged.
- **Stack:**
  - desktop: Tauri 2 (Rust backend) with React 19, TypeScript, Zustand and Tailwind;
  - web dashboard: Vite on Vercel;
  - crew backend: Supabase in the EU (Ireland).
- **Tests:**
  - 61 unit tests for the app logic;
  - 97 Rust tests for scanning, files, audio and the AI connection;
  - 57 database tests covering crew rules, privacy and limits.
  - Both builds are clean.
- **Pull requests:** 26 merged since the start (#1 to #27). None open.
- **Live:**
  - crew website: https://fl-manager-crew.vercel.app (Hivo);
  - installers: GitHub releases in the private repo (`desktop-0.1.0-r2`: Mac universal .dmg and Windows setup .exe);
  - Claude Design project "fl-Manager": holds the 28 synced components, already in the Hivo / System 02 look.
- **Quality pass done:** a three-part audit (Rust↔app bridge, app wiring, crew backend) found and fixed every broken link between features (PR #24).
- **Free stack, by choice:**
  - Gemini free tier for AI text;
  - Cloudflare Workers AI (free) for cover concepts;
  - ffmpeg on your own computer for video;
  - Supabase and Vercel free tiers;
  - no paid APIs.

---

## 3. Features: what's ready, what's in progress, what's blocked, what's only an idea

### Ready to use (merged)

**Your songs, from any DAW**
- Scans your project folders for FL Studio, Ableton Live, REAPER and Studio One, and reads tempo, plugins, samples and track names from inside them. Pro Tools, Cubase and Bitwig projects are listed and tracked, but their files are closed formats, so nothing is read from inside.
- Groups everything that belongs to a song: backups, mixdowns, recorded takes and stems.
- If you rename or move a project, the song keeps its stage, notes and credits.
- Sample data mode, to demo the app without real projects.

**The song panel**
- Stage, key, tags, notes, releases, credits and who it was pitched to.
- A Files view showing where everything lives: project, backups, takes, stems, mixdowns and the Launch Kit folder.
- **Actions:**
  - Open in the right DAW, or reveal in the folder.
  - Save as a new version.
  - Restore a backup.
  - Safely clean old backups (it can only delete files the scan listed as backups).
- **FL Studio only:** render a mixdown from the app, and package a project with all its samples into a zip.

**Seeing the whole picture**
- Pipeline board: every song by stage (Creation, Production, Prep, Release, Promotion), with drag and drop.
- **Dashboard:**
  - song counts, a year of studio activity, stalled songs (no save in 21+ days) and the next release;
  - who's on what, and a plugin toolkit (which plugins each song uses);
  - a health check: "will this computer open your songs" (missing plugins or samples).
  - A Me / Crew switch.
- Releases (EPs, albums) with their track lists, and a release calendar with readiness checks.
- People: credits, splits, and pitches.

**The Launch Kit (the deal-breaker)**
- Fills in the release metadata by itself:
  - title, artists, producers, genre, BPM;
  - key (from the project, or estimated from the mixdown), duration;
  - songwriters and splits from the credits.
- Every field shows where it came from: Detected, Suggested, AI draft, Edited, or Needs you.
- Checks the master against distributor specs (WAV, 44.1 kHz, no clipping).
- Suggests a release date: the first Friday at least 28 days out that doesn't clash with the crew's other drops.
- Finds the hook in the mixdown (the part that comes back most, not just the loudest) and cuts snippets for reels and stories: the hook, a 30 s teaser that builds into it, and an alternate cut. Each says why it was picked ("comes back 3 times").
- Snippet editor: drag a snippet on the waveform, click to place it, type a start time, pick a length (7, 15, 30 or 60 seconds), with a playhead while it plays.
- Renders 9:16 shorts locally with ffmpeg, free, no upload.
- Writes a cover art brief and generates cover concepts with FLUX (free tier).
- **AI layer (optional, Gemini free tier):**
  - drafts captions;
  - reviews every field with a verdict and a confidence score.
  - It never overrides measured values like BPM or duration.
  - Built to stay inside the free tier: when one Gemini model hits its limit, it switches to the backup model; a used-up daily quota is skipped; calls are spaced out; and it doesn't re-check a kit that hasn't changed.
- Accept all, edit any field, reset, or do it all by hand.
- Exports a ready folder: metadata (JSON and CSV), a sheet to paste into your distributor, the cover brief, captions, a checklist, the snippets, the shorts and the chosen cover.

**The crew (shared, EU-hosted)**
- Sign in with an email code; no passwords.
- Create a crew, invite with a code, join, leave. You can be in up to 10 crews.
- Owners can revoke invite codes and remove members.
- Each song is shared only if you choose to. Only facts travel: title, stage, BPM, key, tags, credits, dates, and "has a mixdown". Audio, file paths, samples, notes and track names never leave your computer.
- Live updates for everyone, including when a song is unshared or someone leaves.
- A song only disappears from the crew when you unshare it, never because a scan missed it.

**The crew website**
- A landing page (what it is, privacy, sign in).
- Once signed in: the crew board (change a stage by dragging), the calendar, and the crew page. Works on a phone.

**Design**
- "System 02, built like a rack unit": solid warm greys, engraved labels, LED status lights, one hot orange, condensed caps for titles and buttons.
- Designed in Claude Design and applied across the app and the website.
- The component library is synced back to Claude Design, so new designs there use the real components.

**Brand and installers**
- Hivo name and hive-cell logo everywhere: the app, its icons, the website, the link preview, the sign-in emails.
- Mac (universal) and Windows installers, built locally and kept as private GitHub releases. They're unsigned, so expect a one-time warning on first launch.

### In progress

- **Testing on real songs and a real PC.**
  - The new hook detection was tested on synthetic audio, not yet on the crew's tracks.
  - The Windows installer was cross-built on a Mac and hasn't been run on a Windows PC yet.

### Blocked

- **Automatic installer builds.**
  - The cloud build (Windows .exe/.msi and Mac .dmg on every version tag) is written and ready.
  - GitHub refuses to run it: "recent account payments have failed or your spending limit needs to be increased".
  - **Workaround in use:** build both installers by hand on the Mac.
  - **Unblock:** fix GitHub billing, or make the repo public (which needs the history scrub first).
- **Going public with the repo.** Old commits still contain artist names and a personal email. **Unblock:** rewrite the git history.
- **Sign-in emails at crew scale.** Supabase's built-in email sender is heavily rate-limited. **Unblock:** pick a domain for Hivo, then connect a free mail provider (Brevo was the plan).
- **The crew pitch (Phase 0).** Waiting on you: what problem it solves for the crew, what it looks like in six months, what you need from them, and the label questions to bring as questions, not answers.

### Decisions waiting on you

- **Crash safety in release builds.** Right now a crash while reading a damaged project file closes the whole app (the release build is set to abort on panic). The recommendation is to switch to unwind so it just skips that file.
- **Stage conflicts between devices.** When two people move the same song at nearly the same time, the app compares device and server clocks. With a badly wrong clock, the wrong move can win. Rare, but it needs a design call.
- **A Hivo domain**, needed for the website address and for sign-in emails.

### Thought about, not built

- **Logic Pro.** Not readable today. The link-preview design mentioned it, so the rendered image lists FL Studio, Ableton Live, REAPER and Pro Tools instead.
- **Render and package for DAWs other than FL Studio.** Today the app tells you where to export in your DAW instead.
- **Exporting stems from the app.** Stems are detected and shown, not created.
- **Distributor-specific export formats** (per-distributor templates instead of one universal sheet).
- **Shared releases.** The database already has a table for crew releases, but the apps don't sync releases yet; only songs are shared.
- **Phase 2, in full:**
  - **Plugin recommendations:** suggest plugins by stage, knowing what's installed. Today the app knows which plugins each song uses and whether this computer has them. It does not scan plugin folders or compare against a market catalog.
  - **Hardware awareness:** identify connected interfaces, controllers and synths (USB IDs, MIDI and audio device names).
  - **A "confirm once" studio profile** for what can't be detected (cloud plugins, analog gear).
  - **Social publishing** straight from the Launch Kit (via a posting service such as Typefully, Buffer or Ayrshare; Instagram rules to check early).
  - **Distributor integrations** (push metadata and files instead of re-typing; many distributors only allow manual upload).
- **Money (splits, contracts, rights registration).** Deliberately out of scope until the crew decides together.

---

## 4. Vision (unchanged)

- **The crew:** five friends making rap music; three already release on Spotify and Deezer. You run operations: everything around a release that isn't the music itself. The classic killer of small crews is losing track of half-finished songs.
- **The gap:** distributors only touch the finished file. Hivo is plugged into the project while it's being made, so the gap between "song is finished" and "the world hears it" can be one click.
- **The deal-breaker:** the one-click Launch Kit. The project file is the single source of truth that drives everything downstream.

## 5. Product principles (unchanged)

1. Fast by default, never a black box.
2. Every generated field is checked by an AI pass, with visible confidence.
3. Fully editable and fully optional: accept all, edit any field, or do it by hand.
4. Detect what you can, ask once for the rest.
5. Design matters: it should look like it belongs to artists.
6. Focus beats breadth.
7. Learn what's painful before building it.

## 6. Song lifecycle

Every song is in exactly one stage: **Creation** (rough beat and lyrics), **Production** (recording, mixing, mastering), **Prep** (cover, metadata, date, distributor), **Release** (release day), **Promotion** (posts, reels, follow-up). Songs nobody has placed yet are **Unsorted**.

---

## 7. Phase checklist

**Phase 0: stabilize and demo-ready**
- [x] Review the code, fix fragile parts
- [x] Runs cleanly on a fresh machine
- [x] Project folders are configurable, no hardcoded paths
- [ ] Repo clean enough to be public: current files are clean; **old commits need a history rewrite**
- [x] Setup guide
- [x] Polished demo stats
- [ ] Crew pitch

**Phase 1a: shared crew dashboard**
- [x] Each member's songs visible to the group (opt-in, metadata only, EU)
- [x] Board by stage
- [x] Who's on what, last activity, stalled songs
- [x] Group stats vs personal stats (Me / Crew switch)
- [x] Release calendar
- [x] Where each song's files live

**Phase 1b: Launch Kit**
- [x] Extract everything possible from the project and the mixdown
- [x] Generate metadata, snippets, release timing, cover brief, captions (plus shorts and cover concepts)
- [x] AI verification on every field, with confidence
- [x] Full edit UI: accept all, edit per field, or manual
- [x] Export a distributor-ready kit (one universal format; per-distributor formats not built)

**Phase 1c: design identity**
- [x] A visual identity for the crew (System 02, Hivo brand)
- [x] Applied across the app and the website

**Phase 2: ecosystem**: not started (see "Thought about, not built").

---

## 8. Suggested next steps

1. Try the Launch Kit on a few real songs whose hook you know, and run the Windows installer on a PC.
2. Pick a Hivo domain; set up the mail provider so crew sign-in is reliable.
3. Decide crash safety (abort vs unwind) before handing installers to the crew.
4. Prepare and give the crew pitch with the demo.
5. Fix GitHub billing (or scrub history and go public) so installers build automatically.
6. Then choose the first Phase 2 slice. Social publishing from the Launch Kit is the natural next "magic" moment.

## 9. Notes for Claude Code

- Read `CLAUDE.md` first: it has the commands, rules and where each feature lives.
- Keep paths, credentials and keys out of the code. Only the public Supabase key ships in apps.
- Free stack only; ask before adding anything paid.
- Never change the app identifier (`com.theiaweb.flstudiomanager`): it's where everyone's data lives.
