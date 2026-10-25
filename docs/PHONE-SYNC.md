# Hivo phone sync, v1 (contract for the desktop server and the phone app)

Scope v1 (phase B steps 2-3, docs/NOVEMBER-PLAN.md): the phone pairs with the
desktop over the local Wi-Fi, lists the desktop's **saved prods, beats and
songs**, and reads/writes **notes** on each. Nothing goes through Hivo's
server or any cloud (user decision 2026-10-25). Not in v1: BandLab share,
voice memos, files, ideas inbox, session view (step 4), mDNS discovery.

## Security model
- Opt-in: Settings → Phone sync, **off by default**. The HTTP listener exists
  only while it's on; turning it off closes the port.
- Pairing: the desktop generates a random 32-byte key per pairing and shows a
  QR code once. The phone stores the key (secure storage). The desktop keeps
  paired devices in its config dir (`phone-sync.json`, owner-only file, like
  ai.json / spotify.json), never in workspace.json, never sent to the webview
  after the QR is shown. "Forget" deletes a device's key.
- Transport: plain HTTP on the LAN (port chosen by the OS, saved and reused
  when free). **Every request and response body is an envelope encrypted and
  authenticated with the device key**: XChaCha20-Poly1305, 24-byte random
  nonce, AAD = `"hivo-sync-v1|" + deviceId + "|" + path`. Anything that fails
  to decrypt gets a bare 401 with no detail.
- Replay protection: each decrypted request carries `ts` (ms since epoch) and
  `nonce`; the desktop rejects `|now - ts| > 120 000` and any nonce seen in the
  last 10 minutes (bounded in-memory set).
- Limits: request body ≤ 1 MB, note text ≤ 20 000 chars (MAX_NOTE_CHARS), at
  most 500 note changes per push, simple rate limit (e.g. 10 req/s per device).
- Listens on all interfaces (the phone is another device), but only paired
  devices can do anything.

## Pairing QR payload
A URL, all base64url without padding:
`hivo://pair?v=1&d=<deviceId>&k=<key b64url>&h=<host1>,<host2>&p=<port>&n=<desktop name, URI-encoded>`
- `deviceId`: 16 random bytes, b64url (also stored with the key on the desktop).
- `h`: the desktop's private IPv4 addresses (10/8, 172.16/12, 192.168/16),
  best first. The phone tries them in order.
- Also shown as text under the QR (for the iOS Simulator, which has no camera:
  paste the URL).

## Envelope (HTTP)
Request: `POST http://<host>:<port><path>` with headers
`X-Hivo-Device: <deviceId>` and `Content-Type: application/json`, body
`{"n": "<nonce b64url>", "c": "<ciphertext+tag b64url>"}`.
Plaintext request JSON: `{"ts": <ms>, "nonce": "<random 16 bytes b64url>", "body": <payload>}`.
Response: same envelope shape with AAD path suffixed `|resp`; plaintext
`{"ok": true, "body": <payload>}` or `{"ok": false, "error": "<short message>"}`.
Health check without crypto: `GET /v1/ping` → `{"app":"hivo","v":1}` (no data).

## Endpoints (all POST, encrypted)
### `/v1/hello` — payload `{"phoneName": "<model, ≤60 chars>", "appVersion": "x.y.z"}`
→ `{"desktopName": "...", "hivoVersion": "0.5.x"}`. First successful hello
marks the device as paired-and-seen (desktop shows phone name + last seen).

### `/v1/snapshot` — payload `{}`
→ `{"items": Item[], "generatedAt": <ms>}` where
```
Item = {
  "kind": "prod" | "beat" | "song",
  "id":   "<prod: lead hash | beat: file path | song: project path>",
  "title": "...",
  "subtitle": "<prod: producer · year | beat: folder name | song: stage label>",
  "bpm": number|null, "key": string|null,
  "url": string|null,            // prods: the https link (YouTube etc.)
  "stage": string|null,          // songs: creation|production|prep|release|promotion|null
  "note": string,                // "" when none
  "noteHash": "<fnv1a-32 hex of note, '811c9dc5' for empty>"
}
```
Prods = the Digger's saved prods (`leads`), beats = the Digger's beat files,
songs = visible projects (not archived, not templates). Notes: prods →
`workspace.leadNotes[hash]`, beats → `workspace.beatNotes[path]`, songs →
`workspace.songs[path].notes`. Demo mode: the desktop answers
`{"ok": false, "error": "demo"}` (sample data is never synced).

### `/v1/notes` — payload `{"changes": [{"kind","id","text","baseHash"}]}`
For each change: if the desktop's current note hash == `baseHash`, the note
becomes `text`. Otherwise it's a **conflict**: the desktop keeps both,
`current + "\n\n--- from <phoneName> ---\n" + text`, and reports it. Unknown
ids (deleted since) → `"missing"`.
→ `{"results": [{"kind","id","status":"applied"|"conflict"|"missing","note":"<final text>","noteHash":"<hash>"}]}`

Two cases are `"applied"` without a merge even when the hash differs (added
2026-10-25 by the desktop build; the wire format is unchanged): the desktop
already holds exactly `text` (a retried push whose answer was lost would
otherwise duplicate the note), and the desktop's note is empty. Changes are
applied in order, so a second change to the same item sees the first.
The phone should always replace its cached note with `note`/`noteHash` from
the result, and keep its own text when the status is `"missing"`.

## Who does what on the desktop
- **Rust** (`src-tauri/src/phone_sync.rs`): listener (tiny_http on a thread),
  envelope crypto (chacha20poly1305 crate, XChaCha20Poly1305), replay set,
  limits, paired-device store (`phone-sync.json`), commands:
  `phone_sync_status`, `phone_sync_enable(on)`, `phone_sync_pair()` → the QR
  URL (new device), `phone_sync_forget(deviceId)`.
- **Data stays in the webview's store** (single writer of workspace.json):
  Rust forwards each decrypted `/v1/snapshot` and `/v1/notes` request to the
  webview with a Tauri event (`phone-sync-request {id, path, body, phoneName}`)
  and waits (≤10 s) for `phone_sync_reply(id, body|error)`; then encrypts and
  answers. If the window is gone or too slow → `{"ok":false,"error":"busy"}`.
- **TS** (`src/lib/phoneSync.ts` pure helpers + tests: snapshot builder,
  fnv1a hash, apply-changes with conflict merge; listener wired in the store).
  Notes writes go through the existing `setLeadNote` / `setBeatNote` /
  `updateSong(path, {notes})`.
- **Settings → Phone sync** section (EN/FR): on/off, "Pair a phone" → QR
  (npm `qrcode`, rendered as a data: URL image) + the URL as text + "Done",
  paired phones (name, last seen, Forget), the first-time note that macOS /
  Windows will ask to allow incoming connections.

## Phone app (`mobile/`, Expo, TypeScript)
- Screens: **Pair** (scan QR with expo-camera, or paste the `hivo://` URL),
  **Library** with three tabs (Saved prods / Beats / Songs, search box),
  **Note** editor (plain text, `[Verse 1]`/`[Hook]` headers, autosave),
  header shows desktop name + "Synced 2 min ago" + a Sync button.
- Offline first: snapshot + notes cached locally (AsyncStorage); edits queue
  with their `baseHash`; sync = push queued changes (`/v1/notes`), then pull
  `/v1/snapshot`; conflicts show a small banner on that note.
- Prods: an "Open link" button (the YouTube URL in the system browser).
- Crypto: `@noble/ciphers` (xchacha20poly1305) + `@noble/hashes` if needed,
  random bytes from `expo-crypto`. Key + deviceId in `expo-secure-store`.
- Android: cleartext HTTP to private IPs must be allowed (expo-build-properties
  `usesCleartextTraffic: true`). iOS: `NSAppTransportSecurity` →
  `NSAllowsLocalNetworking: true`, and `NSLocalNetworkUsageDescription`.
- Builds: Android release APK built locally (`npx expo prebuild` + Gradle,
  JDK 17 and the Android SDK are installed); iOS via `npx expo run:ios` on the
  Simulator (Xcode 26.6, iPhone 17 Pro).

## Shared test vectors
- fnv1a-32 (same as `leadHash`): "" → `811c9dc5`, "a" → `e40c292c`.
- Envelope: both sides test encrypt→decrypt round trips, wrong key → error,
  wrong AAD/path → error, stale ts → rejected, replayed nonce → rejected.

## Desktop implementation notes (step 2, 2026-10-25)
Built in `src-tauri/src/phone_sync.rs`, `src/lib/phoneSync.ts`,
`src/store/phoneSyncBridge.ts` and `src/components/PhoneSyncSettings.tsx`.
Precisions the phone can rely on (nothing here changes the formats above):
- **Note hash:** fnv1a-32 over the note's UTF-8 bytes, **not trimmed**
  (`fnv1a32` in `src/lib/digger.ts`). `leadHash` trims the url first, so it is
  the same function only for already-trimmed input; the vectors above hold.
  Notes are stored as typed, capped at 20 000 chars; a blank note is `""`.
- **Bare statuses** (no body, no envelope): 401 anything that doesn't open
  (unknown device, bad envelope, wrong key/AAD/path, stale `ts`, replayed
  nonce), 413 body over 1 MB, 429 more than 10 requests per second for a
  device, 503 more than 16 requests in flight, 404 unknown path or method.
- **Errors inside the envelope** (`ok: false`): `"demo"` (sample data),
  `"busy"` (no window, no answer within 10 s, workspace not loaded yet, or a
  project scan running), `"bad request"` (payload shape), `"too many changes
  (500 max)"` and `"note too long (20000 characters max)"` (the whole push is
  refused before anything is written).
- `nonce` (inside the plaintext) is 1 to 64 characters; the 16 random bytes
  b64url (22 chars) fit.
- `phoneName` is trimmed, control characters removed, ≤ 60 chars; an empty
  one becomes "Phone". It's the name used in conflict markers.
- **Pairing:** "Pair a phone" drops paired devices that never said hello (an
  abandoned QR) before adding the new one; at most 20 paired phones. `h` holds
  up to 4 private IPv4 addresses: the default route's first, then physical
  interfaces, 192.168 before 10 before 172.16.
- **Snapshot details:** song `title` is the project file name, song `bpm` is
  the project tempo rounded to 2 decimals, beat `bpm`/`key` are null (beats
  carry no analysis), prod `subtitle` is `producer · year` without empty parts.
- **Port:** chosen by the OS on first start, saved in `phone-sync.json` and
  reused while free. The QR always carries the current one.
