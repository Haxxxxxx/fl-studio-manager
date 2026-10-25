# Hivo mobile: lyrics and creation companion (draft plan, November 2026)

Status: **draft, nothing built.** Asked for on 2026-10-25. Read the guardrail checks and decisions (sections 1 and 7) before building anything.

## 0. The literal ask (guardrail 0)

Write lyrics and ideas on the phone, attach them to a song, and see them on the desktop while working in FL Studio. Everything below is either that, or support for it. Anything else is listed as "later" or "out", on purpose.

## 1. Guardrail checks (these need your answer first)

| Guardrail | Why it applies | Proposal |
|---|---|---|
| **4.1**: crew sign-in is untested by a human | The phone signs in with the same Supabase email code and syncs through the same backend. A share failing to show up was just reported (2026-10-24). | Run the two-account crew test and fix the share bug **before** week 1. The mobile app adds no crew features in v1. |
| **4.2**: November is the coordination milestone ("prove people live in the board") | A mobile app competes for the same month. | Your call. Argument for: lyrics on the phone give the crew a daily reason to open Hivo, which is what the milestone is about. Argument against: it splits the month. |
| **1 / 2**: Hivo is not a notes app or a Notion clone | Writing lyrics is Creation-stage work. | Keep it to lyrics and ideas attached to songs: they feed the session view (desktop) and the Launch Kit (distributors ask for lyrics). No folders, no rich text, no docs. |
| **Privacy line** (ARCHITECTURE: notes never leave the computer) | Lyrics on the phone means lyrics stored in Supabase. | New private tables, visible **to their owner only** (RLS), never shared with the crew in v1. Add a row to "What is shared" in ARCHITECTURE.md. |
| **7**: free stack only | A native iOS app needs an Apple Developer account (99 USD a year). Voice memos and beats on the server would mean storing audio there (the "never audio" rule). | Build a PWA (free). Keep voice memos and beats on the phone in v1. |

## 2. Platform: a PWA built from `web/` (recommended)

- **Why:** free; reuses `web/` and the `@shared` modules (types, i18n, songs); same Supabase sign-in; installs to the home screen on iOS and Android; works offline (service worker plus IndexedDB). Ready for November.
- **Native later (Expo / React Native)** only if the PWA hits a real wall (background audio, deep OS integration). Cost: Apple 99 USD a year, Google 25 USD once. Needs your OK (guardrail 7).
- Lives at `hi-vo.fr/app` (same Vercel project, same CSP rules, data goes browser → Supabase, never through Vercel).

## 3. Feature list

### Phone, v1 (November)
1. **Sign in** with the email code (the existing flow).
2. **My songs:** the songs you marked "On my phone" on the desktop (title, stage, BPM, key), plus songs started on the phone.
3. **Lyrics editor:** plain text with section headers (`[Verse 1]`, `[Hook]`, `[Bridge]`…). A syllable count per line and a bar estimate from the song's BPM. Autosave, offline first, syncs when back online.
4. **Ideas inbox:** quick capture (a punchline, a title, a concept) without a song; attach it to a song later, from the phone or the desktop.
5. **New song idea:** a song started on the phone (title + lyrics). It shows up in the desktop inbox, where you link it to a project folder once the beat exists.
6. **Voice memos (on the phone only):** record a flow or melody idea, kept on the device; share it to the desktop yourself (AirDrop, Files). Nothing goes to the server.

### Desktop, v1
1. **Lyrics panel** in the song drawer: the same lyrics, editable both ways.
2. **"On my phone" toggle** per song (pushes a private stub: title, stage, BPM, key) and **Settings → Phone sync** on/off. Off by default.
3. **Ideas inbox:** ideas and phone-started songs waiting to be linked to a project.
4. **Session view (teleprompter):** a separate window kept on top of FL Studio, showing the lyrics large, section by section. Arrow keys or scroll to move; optional auto-scroll at the song's BPM. This is the "see them while working in FL" part.
5. **Launch Kit:** an opt-in "Include lyrics" (`lyrics.txt`, like "Include artist IDs"): distributors and lyrics services ask for them.
6. **AI:** lyrics never go to Gemini unless switched on, same rule as notes (`aiIncludeNotes`).

### Later (not v1, each needs a yes)
- Share one song's lyrics with the crew (a featured artist writes their verse). Explicit and per song.
- Rhyme suggestions (Datamuse: free, no key) inside the editor.
- Play the song's beat on the phone while writing. Your own beats would need a private, owner-only audio preview on the server, which overrides "never audio". YouTube links from the Digger's saved prods work without that.
- Mobile DAW projects: FL Studio Mobile (`.flm`) or GarageBand (`.band`) saved to an iCloud/Dropbox folder linked on the desktop and tracked like Pro Tools projects; a "BandLab link" field per song (as far as I know, BandLab has no public project API).

### Out (do not build)
Recording or mixing on the phone, chat or comments, a social feed, AI-written lyrics, stats.

## 4. Data model (one new migration, owner-only)

```
personal_songs  id uuid, owner_id, title, stage, bpm, key, updated_at
                (a song's stub, pushed by the desktop for "On my phone", or created on the phone)
lyrics          id uuid, owner_id, song_id → personal_songs, body text (≤ 20 000 chars),
                version int, updated_at
ideas           id uuid, owner_id, body text (≤ 2 000 chars), song_id nullable, created_at
```

- RLS: owner only, on every table; no crew access in v1. Caps per user (for example 2 000 songs, 5 000 ideas). pgTAP tests like the crew tables.
- Desktop link: a new `SongMeta.phoneId` (uuid, like `shareId`). The desktop keeps a local copy of the lyrics in `workspace.json`, so it still works fully offline.
- **Conflicts:** `save_lyrics(id, body, expected_version)` refuses a stale write and returns the server copy. The app then keeps both: the server version, plus "your offline copy" below a marker, for you to merge by hand. No silent overwrite, no clock trusted (same idea as `move_song_stage`).

## 5. Timeline (2026-10-25 to 2026-11-30)

| Week | Work |
|---|---|
| Now → Nov 2 | **Gate:** the human crew test, the share bug, your decisions (section 7). Ship 0.5.5. |
| Nov 3–9 | Migration + RLS + pgTAP; desktop lyrics panel, "On my phone" toggle, sync. |
| Nov 10–16 | PWA: sign-in, my songs, lyrics editor, offline cache, sync, install to home screen. **Beta on your phone.** |
| Nov 17–23 | Ideas inbox (both sides), phone-started songs, desktop session view. |
| Nov 24–30 | Launch Kit "Include lyrics"; test on one iPhone (Safari) and one Android (Chrome); release **0.6.0** + website deploy. |

## 6. How we'll know it works

- You write a verse on the phone in the studio's hallway, open FL, and the session view shows it before you hit record.
- No lyrics are lost when the phone was offline and the desktop edited the same song (the conflict copy shows up).
- Nobody in the crew can see your lyrics unless you share them (pgTAP proves it).

## 7. Decisions waiting on you

1. **November priority:** mobile lyrics now, or the board milestone first (guardrail 4.2)?
2. **Lyrics stored privately in Supabase** (owner only): OK? This changes the "notes never leave the computer" line.
3. **PWA (free)** or a native app (Apple 99 USD a year)?
4. **Voice memos and beats stay on the phone in v1**: OK?
5. Anything from "Later" you want in v1 instead of something else?
