# Music Command Center: Product Roadmap

> Working vision document. Drop this into the Claude Code project as shared context.

---

## 1. Context

- **The crew:** five friends making rap music: beats, lyrics, vocals, recording. Three of them already release on Spotify and Deezer.
- **My role:** the technical / operations person. Not an artist. My job is to keep the whole machine visible, organized and moving, and to build the tooling behind a potential label.
- **What already exists:** an app that links directly to the **FL Studio project folders**, monitors every song, and surfaces statistics about them. It also has some monitoring and testing features. Repo on GitHub, runs on localhost.
- **Main DAW:** FL Studio.
- **This is my initiative.** The crew isn't currently struggling with a visible mess, so the pitch has to show clear value and momentum, not fix a complaint they already have.

### What a label is, in practice

A label is structure around three things:

1. **Releasing** the music
2. **Promoting** it
3. **Handling the money**

The crew already has the hardest part covered: real music, already on streaming platforms. **The money side (splits, contracts, registration) is deliberately out of scope for now.** This project focuses on releasing and promoting.

The most useful role for a technical person in a small crew is **operations**: everything around a release that isn't the music itself (tracking who's working on what, release calendars, where files live, track metadata, consistent social presence). The classic killer of small music crews is **losing track of half-finished songs**.

---

## 2. Vision

Turn the existing FL Studio monitor into a **creation-aware command center** that follows a song end to end: from the project file being worked on, all the way to release and promotion.

### The positioning gap

- Distributors (DistroKid, TuneCore, etc.) only touch the song at the **very end**, the finished file. They know nothing about how it was made.
- This app is plugged into the **FL Studio project while it is being created**. Nobody owns that moment.
- The gap between "song is finished" and "the world hears it" is currently manual and disconnected. That's where the value is.

### The deal-breaker feature: the one-click Launch Kit

"Deal-breaker" here means a feature so good that users can't do without it, and that other platforms end up having to copy, the way Snapchat's Stories and Instagram's Reels became standard everywhere. The deal-breaker usually hides in the thing only you can do; here, that's being connected to the project file during creation.

When a track is finished in FL Studio, the app already knows everything about it (stems, tempo, energy, timestamps, collaborators). From that, it **auto-generates the whole launch kit**:

- Track metadata (title, artists, BPM, key, genre, credits)
- Snippet clips for reels / stories, cut from the strongest moments of the track
- Suggested release timing
- Cover art brief
- Draft captions and promo copy

The artist reviews, edits if needed, and presses go.

**The project file is the single source of truth that drives everything downstream.**

---

## 3. Product principles

1. **Fast by default, never a black box.** Everything is pre-filled automatically, but nothing is hidden.
2. **AI verification layer.** Every auto-generated or pre-filled field is checked by an AI pass before it is shown as "ready", to catch nonsense, inconsistencies or hallucinated data. Flag low-confidence fields visibly.
3. **Fully editable, fully optional.** The user can:
   - accept all pre-filled data as-is,
   - edit any individual field,
   - or ignore the automation entirely and do everything by hand.
4. **Detect what you can, ask once for the rest.** Never make the user re-enter something the app could find on its own; never pretend to know something it can't.
5. **Design matters.** The app must look like it belongs to artists, not accountants. Catchy, clean, with a strong identity representative of the label / the crew. A demo should make people go "wait, that's magic".
6. **Focus beats breadth.** Build the sharpest slice first, make it gorgeous, then expand. A scattered "does everything" app usually loses to a focused one.
7. **Learn what's painful before building it.** Prefer the simplest version that works (even a shared sheet or checklist) to validate a need before investing in full software for it.

---

## 4. Song lifecycle (the backbone)

Every track lives in exactly one stage at a time:

| Stage | What it means |
|---|---|
| **1. Creation** | Beat and lyrics exist, still rough |
| **2. Production** | Recording, mixing, mastering until final |
| **3. Prep** | Cover art, metadata, release date, sending to distributor |
| **4. Release** | Release day |
| **5. Promotion** | Posts, reels, stories, follow-up after release |

The shared dashboard shows every track on a board by stage, so anyone in the crew can see what's cooking and what's stuck.

---

## 5. Phases

### Phase 0: Stabilize & make it demo-ready (solo work, before pitching the crew)

Goal: the existing app runs cleanly and impresses on first demo.

- [x] Review the current codebase, fix fragile parts
- [x] Make it run cleanly on a **fresh machine**
- [x] Make the **FL Studio project folder path configurable** (no hardcoded paths)
- [ ] Remove anything personal or sensitive from the repo (usernames in paths, API keys, local folders) since the GitHub may be public _(current files clean; old commits still contain artist names + personal author email: rewrite history before going public)_
- [x] Write a short **setup guide** (README)
- [x] Polish the one or two **most impressive statistics** for the demo
- [ ] Prepare the pitch for the crew:
  - What problem does this solve for us?
  - What does it look like in six months?
  - What do I need from them to make it work?
  - Bring big shared decisions (label name, structure, money splits) as **questions, not answers**, so everyone feels like a co-owner
  - Position my role clearly: "I run the backbone of this thing"

### Phase 1: Shared dashboard + the Launch Kit (the core product)

Goal: from personal monitor to crew tool, and build the deal-breaker.

**1a. Shared crew dashboard**
- [x] Multi-user: each crew member's FL Studio projects visible to the group _(opt-in per song; metadata only; Supabase EU + web dashboard)_
- [x] Board view of all tracks by lifecycle stage (Creation → Promotion) _(local: your own projects; shared once multi-user lands)_
- [x] Who's working on what, last activity per project, stalled tracks _(dashboard: Crew + Stalled cards)_
- [x] Decide which stats matter **to the group** vs. only to me, and surface the group ones _(Dashboard: Me / Crew switch)_
- [x] Release calendar (planned and past release dates)
- [x] Clear view of **where each track's files live** (project, stems, bounces, artwork) _(song panel → Files; stems not tracked yet)_

**1b. Launch Kit MVP**
- [ ] Extract everything possible from the FL Studio project / exported audio (BPM, key, duration, stems, timestamps, contributors)
- [ ] Auto-generate metadata, snippet clips, release timing suggestion, cover art brief, captions
- [ ] AI verification pass on every generated field, with confidence flags
- [ ] Full edit UI: accept all, edit per field, or fill everything manually
- [ ] Export the kit in a format ready for the distributor

**1c. Design identity**
- [ ] Define a visual identity that represents the label / crew
- [ ] Apply it consistently across the app

### Phase 2: Ecosystem & integrations

Goal: the app becomes the place the artist never needs to leave.

**2a. Plugin awareness & recommendations**
- Recommend the right plugins (production, vocals) at the right stage, knowing what the user already has.
- **Locally installed plugins: detectable automatically.**
  - Scan standard plugin folders (VST/VST3, plus AU on macOS). Typical locations, to verify per OS:
    - Windows: `C:\Program Files\Common Files\VST3`, common VST2 folders
    - macOS: `/Library/Audio/Plug-Ins/VST3`, `/Library/Audio/Plug-Ins/Components` (+ user-level `~/Library/...`)
  - Read FL Studio's own plugin database (under the Image-Line folder in Documents, "Plugin database"), which lists what FL has registered. Verify exact path/format.
- **Cloud-only / account-locked plugins: NOT detectable.** No local trace, and we have no access to the user's FL / vendor accounts.
- **Market catalog:** build or source a catalog of available plugins to compare against what's installed. Investigate public sources / vendor APIs; may need to be curated manually at first.

**2b. Hardware awareness**
- **Idea:** USB devices expose a **Vendor ID (VID) and Product ID (PID)**. Enumerate connected devices and match them against public ID databases (e.g. the `usb.ids` list) to identify interfaces, controllers, synths.
  - Windows: SetupAPI / WMI
  - macOS: IOKit / `system_profiler SPUSBDataType`
  - Also: MIDI device names (via the OS MIDI APIs) and audio device names (CoreAudio / WASAPI) are often more readable than raw IDs
- **Limits:** only works for devices currently connected; generic or unknown IDs won't resolve; non-USB gear (outboard analog, etc.) is invisible.

**2c. "Confirm once" studio profile (covers what detection can't)**
- Hybrid approach: auto-detect everything possible, then ask the user **once** to confirm their setup (cloud plugins, unplugged or analog hardware)
- Suggest likely matches to make it fast and pleasant, not a chore
- Editable anytime

**2d. Social publishing**
- Connect the user's social accounts and publish posts, reels and stories directly from the app, closing the loop: the launch kit flows straight to the audience.
- Use a third-party posting API rather than building each integration: candidates to evaluate are **Typefully, Buffer, Ayrshare** (check which ones actually support Instagram reels/stories and TikTok).
- Support whichever socials each artist uses, not only Instagram.
- Help keep the crew's social presence **consistent** (shared visual identity, posting calendar across members).
- **Caveat:** Instagram publishing via third parties is strict (generally requires a Business/Creator account, with limits on formats like stories). Validate early.
- This is the delivery pipe: it only matters once the Launch Kit content flowing through it is great, hence Phase 2.

**2e. Distribution integrations**
- Connect to distributors / third-party tools for easier publication on Spotify, Deezer, etc. (push the Launch Kit's metadata and assets instead of re-typing them).
- Check which distributors offer APIs or partner integrations; some may only allow manual upload, in which case the app exports a ready-to-upload package.

---

## 6. Known constraints & open questions

- Distribution to Spotify / Deezer goes through aggregators/distributors; the app prepares the kit, it doesn't replace the distributor (at least initially).
- What is the best way to read FL Studio project data (`.flp` parsing vs. exported audio vs. folder metadata)?
- Where do the shared dashboard's data live (hosted backend vs. sync between machines)?
- Which AI model / service does the verification layer use, and what does "verified" mean concretely per field?
- Plugin market catalog: is there a reliable public source, or does it need curation?
- Privacy: what data from each member's machine is shared with the group?
- Label structure: benefits and issues of formalizing a label, to discuss with the crew.
- Money (splits, contracts, rights registration): intentionally deferred, to be decided together later.

---

## 7. Notes for Claude Code

- **Start with Phase 0.** Review the current code and get it stable and demo-ready before anything else.
- Keep paths, credentials and API keys out of the code (config / env files).
- When building later phases, prioritize the **Launch Kit** as the first new feature; it's the demo moment.
