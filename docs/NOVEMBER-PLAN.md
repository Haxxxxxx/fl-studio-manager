# November plan: finish crew sharing; the mobile creation companion after

Status: **draft, nothing built.** Asked for on 2026-10-25. Order decided by the user: part A first, part B once A is done.

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
- **Sign-in email sender:** Supabase's built-in mailer is rate-limited and meant for testing. Set a custom SMTP sender (an EU provider such as Brevo, free tier) before inviting the crew. **Needs you** (Supabase dashboard).

### A4. Done when
All nine checklist steps pass with two real accounts, A1 is fixed, and the SMTP sender is set. Then part B starts.

---

## Part B: the mobile creation companion (after part A, on the side)

### B0. What it's for (the user's words, condensed)
Hivo helps you untangle your notes on each beat you pick, and the rest of the writing and creation process: lyrics, ideas, voice memos. You write on the phone; the desktop has it while you work in FL Studio. BandLab projects (and other mobile sketches) can be sent to FL through Hivo for detailed work.

### B-now. BandLab today, before any phone app
The interim flow (user, 2026-10-25): **export an mp3 or wav from BandLab and send it to the desktop.**
1. In BandLab: export the mixdown (or stems) as mp3/wav.
2. Send it to the computer: AirDrop to the Mac (lands in Downloads; move it to a beats folder), or save it to iCloud Drive / Google Drive into a folder that's linked as a **beats folder** in Hivo.
3. It shows in the **Digger** like any beat: playable, diggable, savable. **Works today, no code.**
4. **Missing piece (small, desktop only):** "Start a song from this beat" on a Digger beat: the New song dialog opens with the beat's name, creates the FL project from the template as today, copies the audio into the new song folder under `Beat/` (not next to the `.flp`, so it isn't mistaken for a mixdown), keeps a BandLab link if pasted, and opens FL Studio. You drag the audio into the playlist: Hivo never writes `.flp` files.

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
5. **Sketch → FL:** a BandLab export from the phone shows as "Start an FL project from this". Hivo creates the song folder in a linked folder, copies the audio in, keeps the BandLab link, and opens FL Studio. You drag the stems into the playlist: Hivo never writes `.flp` files.

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
