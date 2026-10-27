# UX / UI audit: the user's path through Hivo (October 2026)

Scope: every screen of the desktop app, the pipeline (Creation → Production → Prep → Release → Promotion), the hand-offs between views, first run and Settings, the crew side, and the crew website. Static review of `main` at v0.4.0 plus the Digger fixes in PR #85; nothing was run on Windows, and the phone layout of the website was not tried on a phone. Each finding was checked against the code; line numbers are as read.

Severity:
- **Breaks the journey**: the user cannot get to the next step, loses work, or acts on the wrong thing.
- **Friction**: the step works but costs a detour, a guess or a surprise.
- **Polish**: wording, consistency, tokens.

Rule references are to `docs/GUARDRAILS.md`.

**Status (2026-10-25):** sections 1-2 and 4-7 were worked through in the 0.5.x releases. §3 A1-A4 (the Launch Kit hand-off) fixed on 2026-10-25; the rest of §3 (A5-A6, B1-B13) closed on 2026-10-27 (PR fix/launch-kit-loose-ends; A5-A6 by sensible defaults: the release date wins, readiness counts mixdown freshness and other kit dates, undated releases get a Calendar line). §6 **A3** (no "delete a crew") fixed 2026-10-27 (`delete_crew`). Still open, from §6 **A4** (no owner actions on the website), part A2 item 2. Line numbers below are from v0.4.0 and have moved since.

---

## 1. The big picture

The first half of the journey works: link a folder → songs appear → open the drawer → set a stage → move cards on the board. The second half, **Prep → Launch Kit → Release → Calendar → Promotion, is where the path breaks**: the Launch Kit is a one-way screen, the release date it shows is never saved, and nothing moves a song past Prep. On the crew side, a new member has no visible entry point, and the website has no way to get the app.

Top 10, in order of impact:

1. The Launch Kit's suggested release date is accepted and exported but never saved, so the Calendar, the Dashboard and the crew never see it (§3 A1).
2. The Launch Kit is a dead end: no way back to the song, no Render when the mixdown is missing, no stage change after export (§3 A2, A3).
3. After a rename or move in the DAW, the Launch Kit silently shows a different song (§3 A4).
4. Dismissing the "changes won't be saved" banner leaves no trace; edits are then lost on restart (§5 B2).
5. Folder-pick errors in Settings are swallowed: a refused folder looks like a click that did nothing (§5 B1).
6. A new crewmate has no visible place to join a crew; the crew menu only exists once you're in one (§6 A1).
7. The website has no download or install path for the desktop app (§7 B1).
8. A same-column drop silently hand-pins the column's order; a leftover search makes songs "vanish" with no hint (§2 items 2 and 4).
9. No keyboard access to any song card in the three pipeline views (§2 item 1).
10. With the drawer open, the 900px minimum window leaves about 296px for content; Library, Dashboard and the Digger overflow (§5 B12).

---

## 2. Pipeline (board, list, table)

Files: `src/components/pipeline/*`, `src/lib/pipeline.ts`, `src/lib/crewBoard.ts`, `src/store/usePipelineView.ts`.

**Fine:** rule 8 holds (collapse, sort and search live only in `usePipelineView`; the table sorts a copy; nothing per-view touches the workspace or the crew). Rename and add are shared across views. The last column of a stage can't be removed; removing a column moves its songs to the stage's first column. "Unsorted" is a real column in all three views, so no song is stranded. A rescan relinks renamed `.flp`s and remaps the open drawer. A stale scan can't overwrite a newer one. The drawer opens from every view. Crew moves are version-checked. French strings are complete.

### Breaks the journey
1. **Keyboard users cannot open or move a song.** `PipelineBoard.tsx:56-69`, `PipelineList.tsx:51-60`, `PipelineTable.tsx:97`: `<div draggable onClick>` / `<tr onClick>` with no `tabIndex`, `role`, Enter or Space handler, and no "Move to…" menu. Fix: focusable cards with Enter to open; a "Move to…" popover calling `source.moveCard`.
2. **A same-column drop silently hand-pins the column.** `moveCard` (`pipeline.ts:245-276`) only no-ops when `beforePath === path`; any other drop writes `order[to.id] = current`, which freezes the "most recently saved first" order for that column. Scenario: drag a card a few pixels and release; the board looks unchanged but that column is now hand-sorted forever. Same hole in `crewBoard.ts:82-84` (one RPC per card on a no-op). Fix: return `ws` unchanged when column and resulting order are unchanged.
3. **Collapsed board columns can't be renamed, reordered or removed** (`PipelineBoard.tsx:36-47` renders only a chevron). Drops still land there, with no feedback.
4. **A leftover search hides songs with no hint.** The query survives navigating away and back; counts show filtered songs only; no "N of M shown", no clear button (Escape only works while the input is focused, `PipelinePage.tsx:36`). Empty columns say "Drag a song in" even when the filter is the cause, and "Add column" is hidden while filtering (`shared.tsx:408`). Most likely source of a "my songs vanished" report.

### Friction
5. **Crew board:** crewmates' cards are dead on click (cursor `grab`, no explanation), the stage-conflict dot is never shown there (`crew.tsx:56-85`), and the "X moved it meanwhile" banner has no dismiss (`SourceError`).
6. **Ordering is disabled while searching** (every drop goes to the end of the column, `PipelineBoard.tsx:55`, `PipelineList.tsx:55`) with no notice.
7. **Possible drag flicker on macOS** (`shared.tsx:250`: `dragleave` with a null `relatedTarget` clears the drop line). Unverified; check by hand.
8. Rename allows a duplicate name; rename is double-click only; "Remove?" doesn't say how many songs move; a non-owner double-clicking a crew header gets no response.
9. Crew default column ids become UUIDs on the owner's first save, so everyone's crew collapse state resets once; the crew scope is shared across crews.
10. Edits to an unwritable workspace look like they worked at board level (see §5 B2).
11. Archived-then-restored songs lose their hand order (`pipeline.ts:271` prunes to visible songs).
12. Thin empty states: zero projects = four empty columns, no message; crew board with nothing shared has no "share a song from the drawer" hint; demo mode doesn't say moves are in-memory.

### Polish
- `PipelineView.tsx:16` hardcodes "Pipeline"; "BPM" suffix hardcoded (`mine.tsx:21`, `crew.tsx:67`); raw `String(e)` in `crew.tsx:46`.
- Conflict indicator is an 8px colour-only dot with the text in `title` only (`shared.tsx:472-480`).
- Table "No songs to show" doesn't mention hidden columns.

---

## 3. The song journey and view hand-offs

Files: `src/App.tsx`, `src/store/useAppStore.ts`, `LaunchKitView`, `AlbumsView`, `CalendarView`, `Dashboard`, `NewProjectModal`, `ProjectDrawer`, `src/lib/{launchKit,calendar}.ts`.

**Fine:** New song opens the new song's drawer; Dashboard cards, Calendar rows, album tracks and the attention carousel all have click targets; rescan relinks and the toast explains it; the Accept button is disabled while fields are missing; export confirms when items are open.

### Breaks the journey
- **A1. The suggested release date is never saved.** `launchKit.ts:553-557` recomputes "first Friday after N days" on every render (`source: "suggested"`); `acceptKit` (`useAppStore.ts:735`) only stamps `acceptedAtMs`; `calendar.ts:116` and `crewSync.ts:44` read only `edits.releaseDate`. Scenario: accept all, export; captions and `checklist.md` say "out 6 Nov"; Calendar says "No release dates yet"; Dashboard says "Nothing dated yet"; the crew gets no date; a week later the app's date has moved to the next Friday while the exported files still say 6 Nov. Fix: write the date into `edits.releaseDate` on accept/export, or show it as "not scheduled" and block Accept until confirmed.
- **A2. Launch Kit with no (or a stale) mixdown is a dead end.** `kitChecks` says "Render one…" with no button; the drawer that holds Render is unmounted on the `launch` view (`App.tsx:140`) and `openLaunchKit` nulls `detailPath` (`useAppStore.ts:704`). "Set an export folder in Settings first" (`LaunchKitView.tsx:322`) is plain text. Fix: "Render now" and "Open Settings" actions on those check lines.
- **A3. No way back from the kit, no way forward.** No back-to-song link, no stage control; after export the "what's in your kit" dialog offers no "move to Release" or "add to a release". Nothing else in the app moves a song past Prep; the Calendar's "Released, but N still in Prep" line (`calendar.ts:78-81`) is not clickable. Fix: stage selector + back button in the kit header; make the Calendar line act.
- **A4. The kit silently shows a different song after a relink.** `rescan` remaps `detailPath` but not `launchPath` (`useAppStore.ts:524-525`); `LaunchKitView.tsx:261` falls back to `ordered[0]`. Scenario: "Save as" in FL Studio, come back, edit and export the wrong song. Same silent fallback when the song is archived or a template. Fix: remap `launchPath` in `rescan`; show "this song isn't available" instead of falling back.
- **A5. Two release dates, two readiness stories.** A song on a dated release uses the album's date in Calendar even if the kit date was edited (`calendar.ts:115-117`); an undated album is absent from the Calendar while its songs show as "Single" rows. Readiness (`calendar.ts:64-84`) ignores mixdown freshness, cover and captions; `acceptedAtMs` is not invalidated by a stale mixdown; the album page shows no readiness and no per-track "Open kit" (`AlbumsView.tsx:422-433`).
- **A6.** A song can sit in Release/Promotion with no date and never appear in the Calendar. Acceptable by design, but with A1 and A3 it means the Calendar stays empty for anyone who only follows the kit path.

### Friction
- **B1.** `NewProjectModal.tsx:88-103` re-applies the draft on every rescan (window focus fires one every 15 s), resetting the chosen stage and release. Apply only when `draft` changes.
- **B2.** New song with nothing linked: Create is disabled with no explanation.
- **B3.** After creating a song the view doesn't change; on Library the row isn't scrolled into view and is hidden by any active filter; on Settings/Launch Kit nothing visible happens; Escape during `busy` looks like a cancel but the song is still created.
- **B4.** Dashboard links carry stale Library filters (`Dashboard.tsx:360-363` sets `statusFilter` only; `:755` sets `problemsOnly` only). One `resetLibraryFilters()` for every Dashboard link.
- **B5.** "Plan a release" (`CrewCards.tsx:102`, `CalendarView.tsx:86,98`) calls `setView("albums")`, which reopens the last album instead of the list. Use `openAlbum(null)`.
- **B6.** No next-action for the second half of the journey on the solo dashboard: "Pick up where you left off" is empty when all songs are finished; nothing says "N songs in Prep with no kit".
- **B7.** `SongPicker` says "Ready to launch" from mixdown freshness alone; a Creation-stage song can be listed as ready.
- **B8.** Demo mode: entering forces the Dashboard; exit exists only on the Dashboard banner; Launch Kit has no demo banner, so kit edits on sample data are lost on exit without warning; filters and `launchPath` survive.
- **B9.** Modals: one window Escape handler per open modal, no stack (two open = both close); no focus trap, no `aria-modal`, no focus restore; `RenderPanel` and `RelinkNotice` share the bottom-right corner; `RenderPanel` can't be dismissed while rendering and has no cancel, so a hung FL Studio disables Render and focus-rescan until restart.
- **B10.** The drawer is unmounted on `settings` and `launch` and keyed by `detailPath`: its local state is lost on every trip, and returning from the kit never reopens the song.
- **B11.** Cover concepts live in component state only, so any trip away from the kit (including "Add a key" → Settings) discards them. `window.confirm` is used for export/reset (`LaunchKitView.tsx:323,410,418`).
- **B12.** `AlbumsView.tsx:193,262` and `Dashboard.tsx:437` parse dates as UTC (`new Date("YYYY-MM-DD")`) while Calendar and kit parse local; "released" can flip a day early/late.
- **B13.** `showTemplates` is global: with it on, templates feed Dashboard counts, stalled lists and the kit picker while the sidebar badge excludes them.

### Polish
- Hardcoded English: "Digger" and "Launch Kit" (`Sidebar.tsx:56,61`), `AlbumsView.tsx:89-94` kind labels, store errors (`useAppStore.ts:290,334,439,549-557,578,653-654,667,803,822`), `NewProjectModal.tsx:182`; the exported-kit dialog follows caption language, not UI language (`LaunchKitView.tsx:869`).
- Attention cards don't deep-link (a "no mixdown" card doesn't offer Render). Dashboard stat tiles aren't clickable. "Render finished" shows even when some jobs errored.

---

## 4. The Digger (reviewed separately, summary)

Works step by step; ends at a browser tab with nothing saved and no way into a song. In scope: two-step layout (results take the main area after Dig), dig progress with a Cancel, BPM/key in the beat list from file names, a player with seeking, a setup checklist on the view. Beyond the approved scope (ask first): keep the last dig, a shortlist, "Start a song on this beat". Fixed in PR #85: file drops hijacking the window, the panel being cut off, the drop hint, Gemini timeouts falling back to the backup model.

---

## 5. First run, Settings, empty states, errors

Files: `src/App.tsx`, `src/store/useAppStore.ts`, `SettingsView`, `DetectedFolders`, `LibraryView` (`EmptyLibrary`), `src/lib/relink.ts`, `src-tauri/src/{settings,scope,scanner,paths}.rs`.

**Fine:** first-run detection never links silently; the app is usable during the first scan; UNC and device paths are refused on the Rust side; `workspace.json` is written then renamed; an unreadable workspace is never overwritten; unlinking a folder keeps every song's stage, notes and crew share (re-link restores them); the Digger and Shorts empty states have one-click actions; sample data is a good escape hatch.

### Breaks the journey
- **B1. Folder-pick errors are never shown in Settings.** `SettingsView.tsx:301,309` (project folders) and `:800,:806` (beats folders) have no `.catch`. A NAS path, a drive root or a write failure looks like a click that did nothing. Only `EmptyLibrary` and `DetectedFolders` show these errors.
- **B2. Dismissing the error banner loses the "won't be saved" state.** `dismissErrors` (`useAppStore.ts:370`) clears both errors; `mutateWorkspace` then returns early (`:272`) with no UI; a failed save is retried only on the next edit and `flushPending` does nothing if the timer is null. No view shows `workspaceWritable`. Fix: a persistent indicator while `!workspaceWritable || saveError`, with Retry and Show file.
- **B3. A corrupt `settings.json` looks like a fresh install** with no path to the file and no reset.
- **B4. The first-run folder offer disappears after the first link** (`LibraryView.tsx:310`, `Dashboard.tsx:267`, `PipelineView.tsx:15` gate on `watchedFolders.length === 0`); a second DAW is never offered.
- **B5. Calendar, Releases and Launch Kit tell a user with no folders nothing useful**; Releases says "add songs from your library" with no link; Launch Kit shows a bare line.

### Friction
- **B6.** Unplugged or missing folders are silent (`scanner.rs:171` skips, `scope.rs:67-68` drops); Settings shows no per-folder health; a missing drive then produces "That project isn't inside a folder linked in Settings".
- **B7.** `findRelinks` (`relink.ts:23-34`) can claim a same-named file as "moved" while the original's drive is unplugged, transferring stage, notes, share and album slot onto the wrong file.
- **B8.** Settings is one 12-section page with no ids and no deep links (zero `id="` in `SettingsView.tsx`); every "Settings" button lands at the top. Fix: section ids + `setView("settings", section)` with `scrollIntoView`; copy the one-click pattern from `ShortsPanel.tsx:118-132`.
- **B9.** Scans have no progress, no cap and no cancel; a project folder may be a drive root or `~` (`usable_folder` only checks `is_dir`).
- **B10.** Several rescan failures are invisible (`App.tsx:109`, `LibraryView.tsx:327`, `pickOutputFolder`/`clearPathSetting`).
- **B11.** Removing a watched folder has no confirmation and doesn't say the notes are kept.
- **B12.** 900×600 minimum with the 380px drawer open leaves ~296px of content: Library's 8-column table scrolls sideways, Dashboard tiles get ~55px each, the Digger's 320px side panel overflows. `setView` never closes the drawer. Fix: close the drawer on view change, or collapse the sidebar to icons below ~1100px, or raise `minWidth`.
- **B13.** English-only in the French UI: store strings outside `dict()` (`useAppStore.ts:290,336,359,411,439,549-557,578,653-655`, `useCrewStore.ts:287,573,736`), raw Rust errors, "Shorts (ffmpeg)", "Google:" (`DigPanel.tsx:211`).
- **B14.** `window.confirm` for export/reset/leave crew looks like a browser dialog.

### Polish
- Banners overlap view headers; the browser-mode and settings-error banners can both show.
- "Scanning your projects…" has no spinner (`Dashboard.tsx:270-273`, `LibraryView.tsx:458`).
- `DetectedFolders` lets you link an empty folder with no warning.
- The `key={lang}` remount is sound; it only drops unsaved Settings inputs.

---

## 6. Crew side

Files: `CrewSection`, `CrewPanel`, `CrewViews`, `CrewCards`, `pipeline/crew.tsx`, `useCrewStore`, `src/lib/{crewSync,crewMessages,crew}.ts`, `supabase/migrations`.

**Fine:** only the anon key and URL ship; nothing in the payload code carries a path, note or audio; the sync engine never overlaps cycles, version-checks stage moves and deletes remotely only on explicit unshare; errors are specific and bilingual; sign-out is local-scope. Rule 4 still applies: the whole flow is untested by a human.

### Breaks the journey
- **A1. No visible entry point when not in a crew.** `CrewSection.tsx:28` returns null; the Dashboard has no "join" call to action; the only hint is "Sign in and join one in Settings → Crew" inside a crew view the user can't reach. Fix: one "Join your crew" action on the Dashboard or sidebar when `crew.enabled && !inCrew`.
- **A2. Closed signup needs two out-of-band steps, one of them outside the app.** The owner must add the email in the Supabase dashboard *and* create an invite code; the "New invite code" UI never says so, so a crewmate hits "This email isn't on your crew's list yet" and the owner doesn't know why.
- **A3. "Delete a crew" is mentioned but doesn't exist.** `ownThree` says "delete one first"; no `deleteCrew` anywhere. The only path is remove every member then leave (which deletes the crew via `after_member_left`). The leave confirm uses `window.confirm`; `LeaveCrewButton` (`CrewPanel.tsx:594`) picks `others[0]` as the new owner, which may not match the server rule.
- **A4. The web can't do anything an owner needs** (no invite, remove, leave, rename, columns); its Join screen tells the user to get a code "in Hivo (Crew → Members & invites)", which is desktop-only.

### Friction
- **B1.** OTP: no "Resend code"; "Use another email" clears everything; a wrong code doesn't clear or refocus; the "expires in 10 minutes" hint is hardcoded (`CrewPanel.tsx:31`); the built-in Supabase mailer is rate-limited and nothing tells the owner to set custom SMTP before inviting.
- **B2.** The privacy statement lives only in Settings; the share checkbox says nothing about what leaves the machine. Add one line at the point of sharing.
- **B3.** Unshare takes effect only after the debounced sync and a successful call; offline, the song stays visible to the crew with no "pending" sign. In demo mode the share control just disappears with no reason.
- **B4.** After "Leave crew" (or sign-out) while on a crew view, the view stays set and renders a placeholder with no crew nav (`App.tsx:135-138` doesn't redirect). Fix: when `inCrew` goes false and the view starts with `crew`, `setView("dashboard")`.
- **B5.** Members can't see who's in the crew, the sync status, the refused count or the orphaned-shares warning (all owner-only or inside Settings).
- **B6.** Offline stage conflicts surface only inside the song drawer (`StageConflictBanner`); nothing on the board or sidebar says a conflict is waiting.
- **B7.** A crewmate's move of my song shows only as "moved by X" on the card; no line in the drawer.
- **B8. Rule 3.** "Stalled" and "Next release" are compliant (they open actions). The "who's on what" card (`CrewCards.tsx:126-155`) and the crew dashboard's per-member "last activity" (`Dashboard.tsx:903-906`) are monitoring-shaped and lead to no action; the card is also built from local People, not real members.
- **B9.** Orange misuse: share checkbox `accent-[#ff5a1f]` (`CrewPanel.tsx:770`); web active tab `border-orange-400`, drag-over and "you" label in orange; conflict banner uses `amber-*` instead of the `warn` token; hardcoded `bg-[#2a2112]` in `App.tsx:146,153`.

### Polish
- `window.confirm` vs `ConfirmButton` inconsistency; "Removing someone" doesn't mention it revokes open invite codes; translated strings assembled from fragments (`movedTo`, `whileYours`…); `CrewReleasesView` says "Share with the crew" while the button reads "Share with {crew}"; `KIND_LABEL` (`CrewViews.tsx:146`) is English-only.

---

## 7. The website and its relationship with the desktop app

Files: `web/src/{App,Landing,store}.tsx|ts`, `web/src/{landingCopy,dashboardCopy}.ts`, `web/index.html`, `web/vercel.json`, `.github/workflows/release.yml`.

**Fine:** stage names, "finished" semantics, the board (`crewPipeline`, `groupCrewSongs`, `crewMove`), conflict handling, date formats and the language switch all come from `@shared`; realtime subscribes to songs, releases, columns and members and refetches on visibility, online and every 5 minutes; RLS is tight (no path, note, audio or track-name column exists; `crew_invites` is owner-only; wrong invite codes have no oracle and lock after five tries); the CSP blocks nothing the site does today.

### Same account, same crew?
Yes: both use `signInWithOtp` with `shouldCreateUser: false` and the same `join_crew`/`create_crew` RPCs. Sessions and active-crew picks are separate (`flm-auth` vs `flm-crew-web`), so signing in on one doesn't sign in the other, and a person in several crews can be on different crews in each place. A web stage move reaches an open desktop live (`applyRemoteMoves`), otherwise on next launch; a desktop change reaches the web after the 1.5 s debounce.

### Breaks the journey
- **B1. No download or install path anywhere on the site.** No download, GitHub or "open in Hivo" link (`Landing.tsx`, `landingCopy.ts`); the only text says "your crew lead sends you the installer" (`landingCopy.ts:159,167`) while the status list claims installers are "Ready" (`:139`). The release notes' "Run anyway / Open Anyway" instructions never reach a new member. The repo is private, so a Releases link would 404 for non-collaborators anyway.
- **B2. A crew created on the web is a dead end**: empty board, no invite, share, leave, rename or delete (`App.tsx:203-210`, `556-610`).
- **B3. Errors tell the user to do things the web can't** ("Leave one first", "Hand one over or delete one first"; `dashboardCopy.ts:63`, `crewMessages.ts:62,66`).
- **B4. No invite link**: an 8-character code typed by hand, no `?code=` prefill (`ARCHITECTURE.md:37` says deliberate; still four hand-offs between two people).
- **B5. Deployed without Supabase env vars, sign-in fails invisibly**: `store.ts:174` sets an error the sign-in card never renders; `sendCode`/`verifyCode` return silently (`:199,205`), so the UI moves to "Enter the code" and no email exists.

### Friction
- **F1.** After sign-in, existing members briefly see "not in a crew yet" (`store.ts:185-187` resets crews and defers `loadCrews`; `App.tsx:56` shows Join on an empty list).
- **F2.** No "Resend code"; `sentTo` is component state, so switching to the mail app on a phone can reload the tab and drop to the email step; the FR/EN links are full page loads and reset the form.
- **F3. Rule 3.** The web shows no stalled tracks, next release, readiness or kit trigger; its Crew tab is "who has how many songs and when they last saved". The data exists on the rows; `stalledSongs` just takes `ProjectInfo` instead of `CrewSongRow`.
- **F4. The web calendar is weaker and mislabels.** It lists only songs with `release_date` (no releases/albums, no readiness) and puts every past-dated song under "Released" regardless of stage (`App.tsx:524,548`): a song dated last week and still in Production reads as released, the exact dropped ball the desktop flags.
- **F5. Finished/active logic is reimplemented.** `App.tsx:474` hardcodes the three finished stages instead of `isFinished`; `:566` counts "being made" as creation/production only while the desktop counts every unfinished song; desktop "who's on what" groups by credited People, the web by `owner_id`.
- **F6.** Realtime drops are silent on the web (no `CHANNEL_ERROR`/`TIMED_OUT` handling); the desktop shows "Live updates paused".
- **F7.** `topError` renders once above `<main>`; a "moved meanwhile" message from a card far down the list is out of view on a phone.
- **F8.** Phone layout (unverified): the 4-tab nav has no horizontal overflow and the header doesn't truncate the crew name.
- **F9.** The landing claims "the same board, releases, calendar and crew" and its hero is the desktop dashboard; the web has no stalled/next-release cards.
- **F10.** Version and "October 2026" are hand-maintained in four places (`Landing.tsx:13`, `landingCopy.ts:131,276`, both `package.json`, `tauri.conf.json`).

### Polish
- `web/index.html`: `lang="en"`, English title/description/`og:*` (link previews are English even for `/fr`), `og:title` and page title disagree, `noindex` on the whole site (confirm intended).
- `landingCopy.ts:242` (FR) quotes "N need you" in English; `aria-label="Sections"`; unmapped server errors fall back to English; screenshots show the English UI under French captions.
- Language isn't remembered; the invite input accepts 0/O/1/I/L which the alphabet never contains; `void signOut()` ignores errors; unknown paths return the landing page with 200.
- Low-severity, unverified: unfiltered DELETE subscriptions (`store.ts:122-142`) may deliver other crews' deleted uuids to any signed-in user (ids only; handlers ignore unknown ids).

---

## 8. Suggested order of work

1. Launch Kit hinge: save the accepted date; Render / Settings actions on the check lines; back button + stage selector; remap `launchPath` on rescan (§3 A1–A4).
2. Save-failure visibility: persistent indicator + Retry; show folder-pick errors in Settings (§5 B1–B2).
3. Pipeline: no-op same-column drops; filter indicator + clear; keyboard access (§2 items 2, 4, 1).
4. Crew entry: "Join your crew" action; owner guidance on the Supabase email step; redirect off crew pages when the crew is gone (§6 A1, A2, B4).
5. Website: a download path (even "ask your crew lead" with a real link once the repo is public); import `isFinished`; fix the "Released" bucket (§7 B1, F4, F5).
6. Settings deep links and the drawer-at-900px layout (§5 B8, B12).
7. Everything under rule 3 (monitoring-shaped crew cards) needs a product decision, not a code fix.

Per rule 4, items 4 and 5 should wait for one human to run the sign-in → invite → share flow end to end.
