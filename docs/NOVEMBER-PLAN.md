# November plan: finish crew sharing; the mobile creation companion after

Status: **draft, nothing built.** Asked for on 2026-10-25. Order decided by the user: part A (crew), then part A2 (finish the brief), then part B (mobile). Tracking: tick items here as they close, and the matching boxes in ROADMAP.md section 7.

---

## Part A: crew and sharing (first)

Guardrail 4.1: nothing new is built on the crew foundation until a human has verified it end to end. This part is that verification, plus the fixes it turns up.

### A1. The "I shared a song and nothing shows" report (2026-10-24)
What the local workspace says (read-only check, 2026-10-25): one song is marked shared, with a share id, the crew set, its stage settled and nothing pending. So the desktop side believes the push went through, and the row most likely exists on the server. Suspects, in order:
1. **The viewer is on another crew** (the website and the desktop each remember their own active crew).
2. **The other account isn't a member** of that crew, or joined a different one.
3. **Live updates** didn't deliver the row, and the view never reloaded.
4. A refusal the panel didn't show clearly.

Steps: reproduce with two accounts (yours plus a test account added in the Supabase dashboard, since sign-up is closed), and note what each screen shows. Fix whatever it is, plus a clear "shared to *crew name*, visible on the board" confirmation after sharing.

### A2. Human end-to-end test (the checklist that unlocks guardrail 4.1)
| # | Step | Where | Pass when |
|---|---|---|---|
| 1 | Sign in with the email code | desktop + website | code arrives within a minute |
| 2 | Create a crew, make an invite code | desktop | code shown, copyable |
| 3 | Second account joins with the code | website **and** desktop | both see the crew |
| 4 | Share a song | desktop (owner) | appears on the other account's crew board, desktop and website, without a reload |
| 5 | Move its stage on the website | website (member) | owner's desktop applies it |
| 6 | Move it on both sides while one is offline | both | conflict banner, nothing lost |
| 7 | Share a release | desktop | shows in Crew releases on both |
| 8 | Stop sharing | desktop | disappears everywhere |
| 9 | Remove the member | desktop (owner) | they lose access; old invite codes stop working |

### A3. Open crew items found in the code
- **Deleting a crew** doesn't exist (only "remove everyone, then leave").
- **The website has no owner actions** (invite, remove, rename, columns); it sends people to the desktop.
- **Sign-in emails** already go through Brevo (custom SMTP, per the roadmap): step 1 of the checklist confirms the codes arrive.
- **Needs you:** a second account (add a test email in the Supabase dashboard → Authentication → Users; sign-up is closed).

### A4. Done when
All nine checklist steps pass with two real accounts and A1 is fixed. Then part A2.

---

## Part A2: finish the initial brief (after A, before B)

What's left of the original roadmap (see [ROADMAP.md](ROADMAP.md) section 7). Code first, then tests, then the human items.

| # | Item | Who | Notes |
|---|---|---|---|
| 1 | **Launch Kit hand-off** (audit §3 A1-A4): save the suggested release date on accept/export; stage control and a way back to the song in the kit header; remap the kit after a relink (never show another song); "Render now" / "Open Settings" on the no-mixdown and no-export-folder checks | Claude | The real breaks between "finished" and "released". Smaller audit §3 items (B1-B12) only where they sit on the same path. |
| 2 | **Delete a crew**; **owner actions on the website** (invite code, remove member) | Claude | Only if the part A test shows they're needed; otherwise park. |
| 3 | **Hook detection on real songs:** run the kit on 3-5 crew tracks whose hook you know | You (+ Claude on the fixes) | Tested on synthetic audio only so far. |
| 4 | **Windows installer on a real PC** | You or a crewmate | Cross-built on the Mac, never run on Windows. |
| 5 | **Ship 0.5.5**, then a release with A2's fixes | You say "ship it" | |
| 6 | **The crew pitch** (Phase 0) | You | What it solves for them, six months out, what you need from them. November milestone: the crew lives in the board. |
| 7 | **Git history scrub** (Phase 0) | Your OK, then Claude | Old commits in the public repo still contain artist names and a personal email. Rewrites every commit and force-pushes `main`. |

### A2 done when
The roadmap's section 7 has no open box except Phase 2.

---

## Part B: the mobile creation companion (after parts A and A2, on the side)

### B0. What it's for (the user's words, condensed)
Hivo helps you untangle your notes on each beat you pick, and the rest of the writing and creation process: lyrics, ideas, voice memos. You write on the phone; the desktop has it while you work in FL Studio. BandLab projects (and other mobile sketches) can be sent to FL through Hivo for detailed work.

### B-now. BandLab today, before any phone app
The interim flow (user, 2026-10-25): **export an mp3 or wav from BandLab and send it to the desktop, as a song in the project folders** (not the beats folder: a BandLab session is a song in progress, not a raw beat).
1. In BandLab: export the mixdown (or stems) as mp3/wav, and send it to the computer (AirDrop to the Mac, or iCloud Drive / Google Drive).
2. **Desktop, new: Library → "Import a BandLab export"** (small, desktop only). Pick the file(s), a name and a linked project folder. Hivo creates `<project folder>/<name>/BandLab/` with the audio, and the song appears in the Library and the pipeline as a **sketch** (stage Creation, playable, with notes, tags, credits and the BandLab link if pasted). The sketch lives in `workspace.json` like every other song's data; nothing is written outside the new folder.
3. **"Continue in FL Studio"** on the sketch: creates `<name>.flp` from your template in that same folder (the existing New song flow) and opens FL. The song keeps its stage, notes and credits, now attached to the `.flp`. You drag the BandLab audio into the playlist: Hivo never writes inside `.flp` files.
4. Not automatic: a file just dropped in a project folder isn't picked up on its own (audio next to projects already means mixdowns and recordings to the scanner; guessing would mislabel them).

### B1. Decisions made (2026-10-25)
- **Nothing written on the phone goes to Hivo's server.** No lyrics, notes, ideas or voice memos in Supabase.
- **The phone and the desktop sync directly over the same Wi-Fi.** That needs a **native app** (browsers block a secure website from talking to a local address), so the mobile app is native (Expo / React Native) and the PWA idea is dropped: without sync it would only be a separate notepad.
- **Timing:** native is "on the side": it starts after part A and isn't promised for November.
- **Distribution:** a free **Android APK** shared directly, and **TestFlight for iOS** (the crew is mostly on iPhone). TestFlight is part of the Apple Developer Program, **99 USD a year**: there's no free TestFlight. A free Apple ID only lets you install your own builds from Xcode on your own phone, and they expire after 7 days. Guardrail 7: decide on the Apple account when the iOS build is ready for the crew; until then, develop with the free Xcode route and the Android APK.
- **v1 includes** the ideas inbox and voice memos.

### B2. How the direct sync works
- **Opt-in on the desktop:** Settings → Phone sync (off by default). Only while it's on, the desktop app listens on the local network and announces itself (mDNS / Bonjour: `_hivo._tcp`). Turning it off closes the port.
- **Pairing once:** the desktop shows a QR code holding a one-time pairing secret and its certificate fingerprint. The phone scans it, and both keep a device key. Unpaired devices get nothing; Settings lists paired phones with "Forget".
- **Encrypted and authenticated:** TLS pinned to the fingerprint from the QR code (no certificate warnings, no trust in the network). Every request is signed with the device key.
- **Offline first:** the phone keeps everything locally (SQLite) and queues changes; they sync whenever both are on the same Wi-Fi with the desktop app open. The phone shows "Last synced with *desktop name*: 2 h ago".
- **Conflicts:** every note carries a version. If both sides changed the same note since the last sync, both copies are kept (yours, plus "from the desktop" below a marker) for you to merge by hand. No silent overwrite, no clock trusted.
- **Files (voice memos, BandLab exports)** travel over the same paired connection, in chunks, and land in the song's or beat's folder on the desktop.
- **Firewall:** macOS and Windows ask once to allow incoming connections when Phone sync is first turned on; the app says so beforehand.

### B3. Feature list (v1)

**Phone (native)**
1. **Your beats and songs:** the list the desktop sends at sync (names, BPM, key, stage). New ideas can be named on the phone.
2. **Notes and lyrics per beat or song:** plain text with section headers (`[Verse 1]`, `[Hook]`…), a syllable count per line, a bar estimate from the BPM. Works offline.
3. **Ideas inbox:** punchlines, titles, concepts without a beat; attach them later.
4. **Voice memos:** record a flow or melody, attached to a beat, a song or an idea.
5. **Receive BandLab exports (and other sketches):** "Share to Hivo" from BandLab's export (mixdown or stems) through the system share sheet; it's attached to a beat or kept as a new sketch, and goes to the desktop at the next sync.
6. **Sync status** and the paired desktop's name.

**Desktop**
1. **Notes on beats** in the Digger (a beat gets notes before it becomes a song), and the same notes in a song's drawer. When a beat becomes a song (a new FL project), its notes move with it.
2. **Phone sync** in Settings: on/off, pairing QR code, paired phones, last sync.
3. **Inbox:** what came from the phone and isn't attached yet (ideas, sketches), to assign to a beat or a song.
4. **Session view (teleprompter):** a window kept on top of FL Studio, showing the lyrics large, section by section; arrow keys or auto-scroll at the BPM.
5. **Sketch → FL:** a BandLab export from the phone becomes a sketch song in a project folder, exactly like "Import a BandLab export" (B-now), then "Continue in FL Studio".

**Later (each needs a yes):** rhyme suggestions, lyrics in the Launch Kit, sharing one song's lyrics with a featured artist, sync away from home (would need a relay: the server question again).

**Out:** recording or mixing on the phone, chat, a social feed, AI-written lyrics.

### B4. Rough timeline (starts when part A is done)
| Step | Work |
|---|---|
| 1 | Desktop: notes on beats and songs, Inbox, session view (useful on their own, before any phone). |
| 2 | Desktop: Phone sync server (mDNS, pairing QR, pinned TLS, signed requests), with tests. |
| 3 | Phone (Expo): pairing, beat/song list, notes editor offline, ideas, sync. Android APK + Xcode install on your iPhone. |
| 4 | Voice memos, BandLab share target, file transfer, sketch → FL project. |
| 5 | Crew beta: Android APK; iOS through TestFlight once the Apple account is decided. |

Step 1 is about a week; steps 2 to 4 are several weeks of part-time work. Native isn't a November promise.

### B5. Done when
You write a verse on the phone for a beat, walk into the studio, the phone syncs over Wi-Fi, and the session view shows it next to FL; a BandLab export becomes a new song folder with its stems; nothing touched Hivo's server.
