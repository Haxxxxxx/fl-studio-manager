# Setup guide

Two ways to get FL Manager running: **install a build** someone shared with you (5 minutes, no tools needed), or **run from source** (for whoever works on the code).

## Option A — install a shared build

Builds are made with `npm run tauri build` (see below) and end up in `src-tauri/target/release/bundle/`:

| OS | File to share |
|---|---|
| macOS | `dmg/FL Manager_<version>_<arch>.dmg` |
| Windows | `nsis/FL Manager_<version>_x64-setup.exe` (or the `.msi`) |

The builds aren't code-signed, so the OS warns the first time:

- **macOS** — "FL Manager can't be opened" / "is damaged": right-click the app in Applications → **Open** → **Open**. If it still refuses, run `xattr -cr "/Applications/FL Manager.app"` once in Terminal.
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

## Where your data lives

Stages, tags, notes, releases, people and settings are FL Manager's own data. FL Studio doesn't store them. They live in the app config folder:

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
- **New song from FL's factory templates**: FL's templates live elsewhere inside the macOS app bundle. Your own templates in a linked `Templates/` folder still work.
