# Setup guide

Two ways to get Hivo running: **install a build** someone shared with you (5 minutes, no tools needed), or **run from source** (for whoever works on the code).

## Option A — install a shared build

**Easiest:** download the latest installer from the repo's **Releases** page on GitHub: `Hivo_<version>_x64-setup.exe` for Windows, the `.dmg` for macOS (universal: Apple Silicon and Intel). They're built in the cloud by `.github/workflows/release.yml` and already point at the crew server.

To publish a new one: push a version tag (`git tag v0.2.0 && git push origin v0.2.0`) or run **Actions → Release builds → Run workflow**, then open **Releases**, check the draft and **Publish**. The crew server settings come from the repo variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions → Variables); `VITE_FEEDBACK_EMAIL` is the address behind the sidebar's "Report a bug or send feedback" button (the button is hidden when it's unset). Updates need two secrets: `TAURI_SIGNING_PRIVATE_KEY` (the updater signing key, generated once with `npm run tauri signer generate`; its public half is `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`) and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API), used only to upload the installers and `latest.json` to the public `releases` bucket (created by the migration `20261024000000_releases_bucket.sql`, so run `supabase db push` once). The app checks `latest.json` on launch and from Settings → "Check for updates"; the website's `/download/mac` and `/download/windows` point at the bucket's `latest/` files.

Local builds are made with `npm run tauri build` (see below) and end up in `src-tauri/target/release/bundle/`. Since 0.5.0 a build also signs its updater artifacts, so it needs the signing key: `export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/hivo.key)"` first (ask the crew admin for the key), or build without updater artifacts: `npm run tauri build -- --config '{"bundle":{"createUpdaterArtifacts":false}}'`.

| OS | File to share |
|---|---|
| macOS | `dmg/Hivo_<version>_<arch>.dmg` |
| Windows | `nsis/Hivo_<version>_x64-setup.exe` (or the `.msi`) |

The builds aren't code-signed, so the OS warns the first time:

- **macOS** — "Apple can't verify the developer" (the app is signed but not notarized): click **Done**, then **System Settings → Privacy & Security** → **Open Anyway** next to Hivo. If macOS says it "is damaged" (builds before 0.2.1), run `xattr -cr "/Applications/Hivo.app"` once in Terminal.
- **Windows** — SmartScreen "Windows protected your PC": **More info** → **Run anyway**.

A macOS build only runs on the architecture it was built on (Apple Silicon vs Intel) unless built as universal: `npm run tauri build -- --target universal-apple-darwin` (needs `rustup target add x86_64-apple-darwin aarch64-apple-darwin`).

## Option B — run from source

### 1. Prerequisites

| | macOS | Windows |
|---|---|---|
| Node.js | ≥ 20.19 ([nodejs.org](https://nodejs.org) or `brew install node`) | ≥ 20.19 ([nodejs.org](https://nodejs.org)) |
| Rust | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | [rustup-init.exe](https://rustup.rs) |
| System | `xcode-select --install` | [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++"; WebView2 (preinstalled on Windows 10/11) |

Full details: [Tauri prerequisites](https://tauri.app/start/prerequisites/).

### 2. Install and run

```bash
git clone <repo-url> && cd FLstudio_management_pluggin
npm ci                 # exact versions from package-lock.json
npm run tauri dev      # first run compiles the Rust side — a few minutes, then fast
```

`npm run tauri build` produces the installers listed in Option A.

## First launch

1. **Link your projects folder.** If FL Studio's default folder exists (`Documents/Image-Line/FL Studio/Projects`, same on macOS and Windows), the app shows it, so click **Use this folder**. Otherwise click **Link a project folder** and pick wherever you keep your `.flp` files. You can link several folders. Change them anytime in **Settings → Project folders**. Nothing is hardcoded: folders are stored in the app's config file (below).
2. **Look around without a folder:** **Load sample data** fills every view with generated songs. Nothing is saved while it's on; linking a real folder leaves sample mode.
3. **Optional, for exporting:** in Settings, check the FL Studio path (auto-detected), and pick an export folder. Use **Test render** before a batch export.

## Optional: AI for the Launch Kit

The Launch Kit works without AI. With a free Gemini API key it also writes captions and a cover concept, and double-checks every field before you export (verdict, confidence, suggested fix).

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Signing in with a Google account is enough, no billing needed.
2. In the app: **Settings → AI**, paste the key, **Save**. Developers can set `GEMINI_API_KEY` in the environment instead; it takes precedence.
3. Optional: pick the language for captions. The default model is `gemini-3.8-flash`; change it there if Google renames models.

The key is stored only on that computer (`ai.json` in the app config folder, owner-only on macOS) and the UI never shows it again. Each crew member uses their own key, so free-tier limits are per person. AI calls send the song name (the project file's name), stage, tags, tempo, key, credits, release dates and the kit fields. Never audio, file paths, sample names or your track names (only a key or a crew member's name spotted in them). Notes are sent only with **Check kit**, and only when **Include notes when checking a kit** is on (off by default); drafts never use them. **On the free tier Google may use what you send to improve its products.**

## Optional: 9:16 shorts (free, on your computer)

The Launch Kit turns each snippet into a 1080×1920 MP4 (H.264 + AAC, 30 fps), the format Reels, TikTok and YouTube Shorts take. Each one is the song's art, title, artist and release date, an animated waveform, and the **real audio** from your mixdown. It runs locally with ffmpeg: no upload, no account, no cost.

1. Install ffmpeg once: `brew install ffmpeg` (Mac) or `winget install Gyan.FFmpeg` (Windows), then restart the app.
2. The app finds it automatically, including Homebrew's folder, which apps opened from Finder can't see on the PATH. If it doesn't, click **Browse** in **Settings → Shorts** and pick the `ffmpeg` file (only a file named ffmpeg is accepted), or set `FFMPEG_PATH`.
3. Launch Kit → **Render 3 shorts**. They're saved in `<export folder>/Launch Kits/<song>/shorts/` and play right in the app.

## Optional: free cover concepts (Cloudflare)

The Launch Kit can paint four cover concepts from the cover art brief with FLUX.1 [schnell] on Cloudflare Workers AI. The free allowance is 10,000 neurons a day (resets at 00:00 UTC). One 1024 px concept costs about 58, so that's roughly 170 images a day, with no card needed.

1. Create a free Cloudflare account at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up), or sign in.
2. Open the Workers AI page: [dash.cloudflare.com/?to=/:account/ai/workers-ai](https://dash.cloudflare.com/?to=/:account/ai/workers-ai). Pick **Use REST API**.
3. Copy the **Account ID** (32 characters).
4. Click **Create a Workers AI API Token**, check the prefilled values, then **Create API Token** and copy it. If you'd rather make a custom token, give it **Workers AI: Read** and **Workers AI: Edit**.
5. In the app: **Settings → Cover art**, paste both, **Save**. Developers can set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` instead. When both are set they take precedence.
6. In a Launch Kit, under **Cover art brief**, click **Generate 4 concepts**. Click one to pick it, then **More like this** (four more from the same prompt) or **Save to kit** (writes `cover-concept.jpg` into `<export folder>/Launch Kits/<song>/`).

Concepts are drafts at 1024 × 1024 px. Distributors need 3000 × 3000, so a designer (or an upscaler) makes the final from the pick and adds the title. FLUX is told to leave text out because it spells badly. The credentials stay on that computer (`cover.json` in the app config folder, owner-only on macOS) and the UI never shows them again. Only the image prompt goes to Cloudflare. It's built from the brief's concept, imagery, palette, tags and any free text you write in it, with the song title, artist names and the Notes line taken out.

## Optional: the crew (shared board, EU servers)

Sign-up is closed: the crew admin adds each member's email first (below). Then sign in with an emailed code, create a crew or join one with an 8-letter invite code, then tick **Share with <your crew>** in a song's drawer (or use **Crew** in the Library for several songs). Everyone in the crew sees shared songs on **Pipeline → Crew** and on the web dashboard, and can move their stage. Moves sync live.

Crew sharing sends facts only: title (the cleaned-up file name, or the one you type under **Crew sees it as**), stage, key, BPM, tags, credits (names, roles, splits), release date, whether there's a mixdown, whether the Launch Kit is accepted, and when the project was last saved. Crewmates also see your crew and display names; your email stays with the sign-in service. Audio, file paths, samples, notes and track names never leave your computer through sharing (the optional AI features are the only thing that sends more, see above). Data is stored by Supabase in Ireland (eu-west-1). Stop sharing a song and it's deleted from the crew board.

**Adding a crew member (admin checklist).** Sign-up is closed, so it's two steps: you add the email, they redeem an invite.

1. Supabase dashboard → the project → **Authentication → Users → Add user → Create new user**: their email, any long random password (password logins are blocked; they always sign in by code), tick **Auto Confirm User**.
2. In Hivo, **Settings → Crew → New invite code** (crew owner): make an invite code and send it to them with the website link.
3. They sign in with their email (app or website), type the 6-digit code from the email, then enter the invite code. The app tells them what to do at each step, in French or English.
4. Check they show up under **Settings → Crew** members.

If they see "not on your crew's list", step 1 was missed or the email has a typo. "Invite code didn't work" means it's wrong, expired, used up or revoked: make a new one.

**Removing a crew member:** the crew owner removes them in **Settings → Crew**. That also revokes the crew's open invite codes; make a new one for the next person.

Builds made for the crew already include the server address. If you run from source, copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the public anon key, never the service_role key). Without them the Crew section says sharing isn't set up and everything else works as before.

## Release builds (admin)

Installers are built on the admin's Mac, registered as this repo's GitHub Actions runner (label `hivo`). It's free: no GitHub-hosted minutes are used. The Mac builds both the macOS `.dmg` (universal) and the Windows `.exe` (cross-compiled with cargo-xwin + NSIS).

- **Make a release:** `git tag v0.2.0 && git push origin v0.2.0` (or Actions → Release builds → Run workflow). The Mac must be on. When it's done, open Releases, check the draft, Publish.
- **Needs on the Mac:** Node, Rust (`rustup`, plus `cargo install cargo-xwin`), `brew install nsis llvm`.
- **The runner** lives in `~/actions-runner-hivo` and runs as a background service. Stop it: `cd ~/actions-runner-hivo && ./svc.sh stop`. Start it: `./svc.sh start`. Remove it: `./svc.sh uninstall`, then `./config.sh remove` (with a removal token from the repo's Settings → Actions → Runners).
- Only use a self-hosted runner on a **private** repo: on a public one, anyone's pull request could run code on the Mac.

## Where your data lives

Stages, tags, notes, releases, people and settings are Hivo's own data. FL Studio doesn't store them. They live in the app config folder:

- macOS: `~/Library/Application Support/com.theiaweb.flstudiomanager/`
- Windows: `%APPDATA%\com.theiaweb.flstudiomanager\`

`settings.json` holds the linked folders and paths. `workspace.json` holds everything else, keyed by `.flp` path. The app never modifies your `.flp` files. Backup clean-up moves files to the Trash or Recycle Bin, so you can restore them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm ci` fails with an engine error | Node is too old: install ≥ 20.19. |
| `Cannot find module @tauri-apps/cli-<platform>` | `node_modules` came from another OS: delete it and run `npm ci` again. |
| `linker 'cc' not found` / MSVC errors | Install the system prerequisites above (Xcode CLT / VS Build Tools). |
| Dashboard says "No songs found yet" | The linked folder has no `.flp` files. Check **Settings → Project folders**. |
| A plugin shows as "not installed" but it is | The app checks the standard VST3/CLAP/VST/AU folders (system and user). Plugins in a custom folder aren't seen yet. |
| Songs from a friend show samples as missing | They really are missing on this computer. Use **Package** on the sender's machine to zip the song with its samples. |

## Known limits (macOS)

Developed and verified mainly on Windows. On macOS, browsing, stats, pipeline, releases, people, playback and packaging work. Two features are **untested on macOS, so don't demo them there yet**:

- **Export / Test render**: FL's command-line renderer flags are only verified on Windows.
- **New song from FL's factory templates**: the app searches the FL Studio `.app` bundle for its `Data/Templates` folder, but this hasn't been checked against a real Mac install. Your own templates (any `.flp` in a `Templates/` folder inside a linked folder) always work.
