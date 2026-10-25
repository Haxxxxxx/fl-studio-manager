# Hivo (formerly FL Manager): Roadmap and status

> Status as of **25 October 2026** (v0.5.4 released; next steps in [NOVEMBER-PLAN.md](NOVEMBER-PLAN.md)). Hard rules for any work: [GUARDRAILS.md](GUARDRAILS.md). This replaces the original vision document: the vision and principles are kept, and every feature now says where it stands. Written to be read aloud or pasted into a chat.

---

## 1. Where we are, in one minute

- **What it is.** A desktop app (Mac and Windows) that watches the crew's music project folders and follows every song from the first session to release and promotion, with a web dashboard for the crew.
- **Releases.** **v0.5.4** is the latest (2026-10-24): Mac universal .dmg and Windows setup .exe, downloadable from the website. Installed apps **update themselves** (signed updates from the Supabase `releases` bucket, Settings → Check for updates). Builds run on the Mac (self-hosted GitHub runner) when a version tag is pushed.
- **Phases.** Phase 0, 1a, 1b and 1c are built (checklist in section 7). One Phase 0 item remains: the crew pitch (prepared outside the repo). The git history was scrubbed on 2026-10-25.
- **What's next: [NOVEMBER-PLAN.md](NOVEMBER-PLAN.md).** In order:
  - **Part A:** verify the crew flow end to end with two accounts and fix the "shared song not showing" report (guardrail 4.1);
  - **Part A2:** finish the initial brief (Launch Kit hand-off fixes and history scrub done; Windows test and pitch left);
  - **Part B, after that:** the mobile creation companion (BandLab exports into projects first, then a native app syncing over Wi-Fi).
- **Ready but not released:** everything merged since 0.5.4 ships as **0.5.5** when you say so (Digger saved prods and converter, People profiles, "Include artist IDs" in the kit, the Library folder tree).

---

## 2. State of the codebase

- **Main branch** is green. Everything below marked "ready" is merged.
- **Stack:**
  - desktop: Tauri 2 (Rust backend) with React 19, TypeScript, Zustand and Tailwind;
  - web dashboard: Vite on Vercel;
  - crew backend: Supabase in the EU (Ireland).
- **Tests** (as of 2026-10-25):
  - 221 unit tests for the app logic;
  - 183 Rust tests (scanning, files, audio, AI, Digger, leads, lookups);
  - 175 database tests covering crew rules, privacy, limits, stage versions, crew columns, the releases bucket and the feedback form.
  - Both builds are clean; CI runs all of it on every PR, plus npm and cargo audits.
- **Pull requests:** 125 merged. Open: the November plan (#136), a design-system docs pointer (#132), and Dependabot bumps held back on purpose (#99, #100, #104, #105, #117).
- **Live:**
  - crew website: https://www.hi-vo.fr, with `/download/mac` and `/download/windows`;
  - installers and update manifest: the public Supabase `releases` bucket, plus GitHub releases (public repo);
  - sign-in emails: sent through Brevo from the hi-vo.fr domain (Supabase custom SMTP);
  - Claude Design project "fl-Manager": holds the synced components, in the Hivo / System 02 look.
- **Free stack, by choice:**
  - Gemini free tier for AI text;
  - Cloudflare Workers AI (free) for cover concepts;
  - YouTube Data API (free quota) for the Digger; Spotify Web API (free app credentials) and keyless MusicBrainz, Deezer and iTunes for People profiles;
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
- **Library:** a folder tree on the left (your linked folders and the folders holding several songs) scopes the table, with a breadcrumb. Flags that match what's on disk: "last saved" counts FL's autosaves, the mixdown light compares to that, missing samples are looked up in **Settings → Sample libraries** before being called missing, unreadable projects are flagged.
- Sample data mode, to demo the app without real projects.
- English and French.

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
- **Pipeline** in three views over one model: board, list and table. Rename, add, remove and reorder columns; each column sits on a stage (Creation, Production, Prep, Release, Promotion), so the crew always sees the stage. Hand-sorted cards, one shared filter; the table sorts on its own without touching the board.
- **Dashboard:** a customizable bento (reorder, hide, add, resize; two views per block): song counts, studio activity, stalled songs (no save in 21+ days), the next release, who's on what (in a crew), a health check (missing plugins or samples), a Me / Crew switch. Five optional "tendency" blocks (tempo & key, working hours, your sound, collaborators, song shape), personal only.
- Releases (EPs, albums) with their track lists, and a release calendar with readiness checks.
- **People:** credits, splits and pitches; **Look up profiles** finds a person's Spotify, Apple Music, Deezer, YouTube, socials… with the IDs distributors ask for (MusicBrainz, Deezer, iTunes; Spotify with free app credentials). Stored locally, never shared.

**The Digger (creation stage)**
- Your raw beats (Settings → Beats folders): pick up to 5, Gemini describes what they share (optionally listening to 30 s of each) and finds similar beats on YouTube and the web; "Go deeper" rounds seeded by the picks you like.
- YouTube results play in the app (the official player, framed through the website so it works in the signed app).
- **Saved prods:** "Save to Prods" keeps a link and its facts as a small file in the beats folder; a tab lists them, plays them, matches them to beats you downloaded. An optional converter link opens in your browser. Hivo itself never downloads audio.

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
  - Built to stay inside the free tier: when one Gemini model hits its limit or is too slow, it switches to the backup model; a used-up daily quota is skipped; calls are spaced out; and it doesn't re-check a kit that hasn't changed.
- Accept all, edit any field, reset, or do it all by hand.
- Exports a ready folder: metadata (JSON and CSV), a sheet to paste into your distributor, the cover brief, captions, a checklist, the snippets, the shorts and the chosen cover. Opt-in **"Include artist IDs"** adds the credited people's platform IDs.

**The crew (shared, EU-hosted)**
- Sign in with an email code; no passwords.
- Create a crew, invite with a code, join, leave. You can be in up to 10 crews.
- Owners can revoke invite codes and remove members.
- Each song is shared only if you choose to. Only facts travel: title (editable for the crew), stage, BPM, key, tags, credits, dates, "has a mixdown", "kit accepted" and the last save date. Audio, file paths, samples, notes and track names never leave your computer through sharing.
- The optional AI features are the one exception, and say so where they're switched on: the song name, tags, tempo, key, credits and kit text go to Google Gemini (notes only if you turn that on), and a cover prompt goes to Cloudflare.
- Live updates for everyone, including when a song is unshared or someone leaves.
- A crew section in the menu: Crew board and Crew releases for everyone; Members & invites and Crew settings for the owner. A "Join your crew" entry point when you're not in one.
- The crew board is the same board / list / table as yours, in the crew's own columns: the owner renames, adds, removes and reorders them; anyone moves cards. The website shows the same columns and order.
- Share a whole release (and its tracks) at once; the crew sees it in Crew releases and on the website's Releases tab.
- Solo mode: until you're in a crew, crew features stay hidden; the Launch Kit is always there.
- Stage moves never trust anyone's clock: the server keeps a version, and a real clash asks you to choose.
- A song only disappears from the crew when you unshare it, never because a scan missed it.

**The crew website**
- A landing page (what it is, privacy, sign in, download for Mac and Windows), in French and English.
- Once signed in: the crew board (change a stage by dragging), the calendar, and the crew page. Works on a phone.

**Feedback and updates**
- A feedback form in the app (bug / idea / question) that reaches you directly, rate-limited; the red error banner's "Report this" prefills it with paths removed.
- In-app updates (checked at launch and from Settings), with a clear fix when the app runs from a read-only place.

**Design**
- "System 02, built like a rack unit": solid warm greys, engraved labels, LED status lights, one hot orange, condensed caps for titles and buttons.
- Designed in Claude Design and applied across the app and the website.
- The component library is synced back to Claude Design, so new designs there use the real components.

**Brand and installers**
- Hivo name and hive-cell logo everywhere: the app, its icons, the website, the link preview, the sign-in emails.
- Mac (universal) and Windows installers on the website and GitHub. The Mac app isn't notarized, so expect a one-time "Open Anyway" on first launch.

### In progress (see [NOVEMBER-PLAN.md](NOVEMBER-PLAN.md))

- **Human test of the crew flow** (guardrail 4.1): two accounts, the nine-step checklist, and the "shared song not showing" report (2026-10-24).
- **Testing on real songs and a real PC.**
  - The hook detection was tested on synthetic audio, not yet on the crew's tracks.
  - The Windows installer was cross-built on a Mac and hasn't been run on a Windows PC yet.
- **Launch Kit, the rest of audit §3** (A5-A6 and the B items: readiness per release, two-dates confusion, modal and drawer friction): only where they block the path to release.

### Blocked

- **The crew pitch (Phase 0).** Being prepared with Claude on the web, outside this repo: what problem it solves for the crew, what it looks like in six months, what you need from them, and the label questions to bring as questions, not answers.

### Decisions waiting on you

- **Ship 0.5.5** (what's merged since 0.5.4).
- **Apple Developer account (99 USD a year):** would remove the Mac warning (notarization) and is required for TestFlight when the iOS app comes. Not done: free stack.

### Thought about, not built

- **The mobile creation companion:** planned in [NOVEMBER-PLAN.md](NOVEMBER-PLAN.md), part B (after part A).
- **Logic Pro.** Not readable today. The link-preview design mentioned it, so the rendered image lists FL Studio, Ableton Live, REAPER and Pro Tools instead.
- **Render and package for DAWs other than FL Studio.** Today the app tells you where to export in your DAW instead.
- **Exporting stems from the app.** Stems are detected and shown, not created.
- **Distributor-specific export formats** (per-distributor templates instead of one universal sheet).
- **Deleting a crew** (today: remove everyone, then leave) and **owner actions on the website** (invite, remove, rename, columns).
- **Phase 2, in full:**
  - **Plugin recommendations:** suggest plugins by stage, knowing what's installed. Today the app knows which plugins each song uses and whether this computer has them.
  - **Hardware awareness:** identify connected interfaces, controllers and synths (USB IDs, MIDI and audio device names).
  - **A "confirm once" studio profile** for what can't be detected (cloud plugins, analog gear).
  - ~~Social publishing straight from the Launch Kit~~: rejected. Posting is a human hand-off (guardrail 2).
  - **Distributor integrations** (push metadata and files instead of re-typing; many distributors only allow manual upload).
- **Money (splits, contracts, rights registration).** Not before the crew actually releases through Hivo (guardrail 4).
- **Release stats** (streams, listeners, revenue): blocked, no free API gives real numbers (guardrail 6). People profiles show Spotify followers only when Spotify shares them with the app.

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
- [x] Repo clean enough to be public (history rewritten 2026-10-25: real names replaced by placeholders, personal email replaced by the GitHub no-reply address, every branch and tag)
- [x] Setup guide
- [x] Polished demo stats
- [ ] Crew pitch (being prepared with Claude on the web, outside this repo)

**Phase 1a: shared crew dashboard**
- [x] Each member's songs visible to the group (opt-in, metadata only, EU)
- [x] Board by stage
- [x] Who's on what, last activity, stalled songs
- [x] Group stats vs personal stats (Me / Crew switch)
- [x] Release calendar
- [x] Where each song's files live
- [x] **Verified end to end by a human with several accounts** (2026-10-25; guardrail 4.1 lifted)

**Phase 1b: Launch Kit**
- [x] Extract everything possible from the project and the mixdown
- [x] Generate metadata, snippets, release timing, cover brief, captions (plus shorts and cover concepts)
- [x] AI verification on every field, with confidence
- [x] Full edit UI: accept all, edit per field, or manual
- [x] Export a distributor-ready kit (one universal format; per-distributor formats not built)
- [x] **Hand-off into Release** (date saved on accept/export, stage control and "Move to Release" in the kit, relink-safe; audit §3 A1-A4)
- [x] Tested on real songs (hook detection works, 2026-10-25)

**Phase 1c: design identity**
- [x] A visual identity for the crew (System 02, Hivo brand)
- [x] Applied across the app and the website

**Phase 1d: shipping**
- [x] Signed in-app updates, website downloads
- [x] Feedback form
- [ ] Windows installer run on a real PC (planned in the coming days)

**Phase 2: ecosystem**: not started (see "Thought about, not built"). The mobile companion is planned separately (NOVEMBER-PLAN part B).

---

## 8. Next steps

The ordered list lives in **[NOVEMBER-PLAN.md](NOVEMBER-PLAN.md)**: part A (crew verification and the share report), part A2 (finish the initial brief), then part B (mobile). Update that file as items close, and tick section 7 here.

## 9. Notes for Claude Code

- Read [GUARDRAILS.md](GUARDRAILS.md) and `CLAUDE.md` first: the hard rules, then the commands, rules and where each feature lives.
- Keep paths, credentials and keys out of the code. Only the public Supabase key ships in apps.
- Free stack only; ask before adding anything paid.
- Never change the app identifier (`com.theiaweb.flstudiomanager`): it's where everyone's data lives.
