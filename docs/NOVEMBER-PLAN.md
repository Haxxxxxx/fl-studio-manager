# November plan: finish crew sharing, then the mobile creation companion

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

## Part B: the mobile creation companion (after part A)

### B0. What it's for (the user's words, condensed)
Hivo helps you untangle your notes on each beat you pick, and the rest of the writing and creation process: lyrics, ideas, voice memos. You write on the phone; the desktop has it while you work in FL Studio. BandLab projects (and other mobile sketches) can be sent to FL through Hivo for detailed work.

### B1. Decisions already made (2026-10-25)
- **Lyrics stay off the server.** Nothing written on the phone is stored in Supabase.
- **PWA now, native later.** The phone app is the website installed to the home screen (free, no App Store); a native app is reconsidered once the crew has used it.
- **v1 includes** the ideas inbox and voice memos (kept off the server too).

### B2. Open decision: how the phone and the desktop talk without Hivo's server
| Option | How | Automatic? | Trade-off |
|---|---|---|---|
| **1. Your own cloud folder / AirDrop** (fits the "off the server" choice) | The phone saves notes, voice memos and BandLab exports to a **Hivo inbox** folder in iCloud Drive or Google Drive (or AirDrops them to the Mac). The desktop watches that folder and files everything under the right beat or song. The desktop writes a small index of your beats and songs to the same folder, so the phone can pick one. | Desktop: yes. Phone: one tap on the share sheet (a PWA can't write to iCloud by itself) | Hivo's server never sees anything; BandLab exports and voice memos travel the same way. Slightly manual on the phone until a native app. |
| **2. Encrypted relay** | Supabase stores only scrambled data it can't read; the key lives on your devices (pair the phone by scanning a QR code on the desktop). | Both | Fully automatic, but encrypted blobs do sit on the server. Doesn't carry BandLab files or voice memos (audio stays off the server). |
| **3. Same Wi-Fi, direct** | The desktop app talks to the phone over the local network. | Both, when on the same network | Browsers block a secure website from talking to a local address, so this needs the **native** app. Later. |

Recommendation: **option 1**. It matches "off the server", and one inbox carries text, voice memos and BandLab exports alike.

### B3. Feature list (v1, assuming option 1)

**Phone (PWA)**
1. **Pick a beat or a song** from the index the desktop leaves in the inbox folder (or type a new idea's name).
2. **Notes and lyrics per beat or song:** plain text with section headers (`[Verse 1]`, `[Hook]`…), a syllable count per line, a bar estimate from the BPM. Autosaved on the phone (works offline).
3. **Ideas inbox:** punchlines, titles, concepts without a beat; attach them later.
4. **Voice memos:** record a flow or melody, attached to a beat or an idea, kept on the phone.
5. **Send to desktop:** one share-sheet tap puts the note, memo or BandLab export in the Hivo inbox folder (or AirDrop to the Mac).

**Desktop**
1. **Notes on beats** in the Digger (a beat gets notes before it becomes a song), and the same notes in a song's drawer. When a beat becomes a song (a new FL project), its notes move with it.
2. **Inbox watcher:** files from the inbox folder are filed under their beat or song; anything unmatched waits in an Inbox list to be assigned.
3. **Session view (teleprompter):** a window kept on top of FL Studio, showing the lyrics large, section by section; arrow keys or auto-scroll at the BPM.
4. **BandLab (or any mobile sketch) → FL:** an exported mixdown or stems landing in the inbox shows as "Start an FL project from this". Hivo creates the song folder in a linked folder, copies the audio in, keeps the BandLab link, and opens FL Studio. You drag the stems into the playlist: Hivo never writes `.flp` files.
5. **Writes the index** (beats and songs: names, BPM, key, stage) to the inbox folder for the phone.

**Later (each needs a yes):** a native app (automatic sync, background recording), rhyme suggestions, lyrics in the Launch Kit, sharing one song's lyrics with a featured artist.

**Out:** recording or mixing on the phone, chat, a social feed, AI-written lyrics.

### B4. Rough timeline (starts when part A is done)
| Week | Work |
|---|---|
| 1 | Desktop: notes on beats + songs, inbox folder setting, watcher, index file, Inbox list. |
| 2 | PWA: install, beat/song picker from the index, notes editor (offline), ideas, share-sheet send. |
| 3 | Voice memos; BandLab/sketch → "Start an FL project"; session view on desktop. |
| 4 | Test on one iPhone (Safari) and one Android (Chrome) with the real inbox folder; release. |

### B5. Done when
You write a verse on the phone for a beat, send it with one tap, open FL, and the session view shows it under that beat; a BandLab export becomes a new song folder with its stems; nothing touched Hivo's server.
