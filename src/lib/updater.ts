import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// In-app updates. The updater plugin reads `latest.json` from the public
// `releases` bucket (endpoint and public key in tauri.conf.json), checks the
// signature of the installer it points at, and swaps the app in place. The
// store (useAppStore.update) owns the state; this module owns the plugin.

/** A newer version the server announced. */
export interface AvailableUpdate {
  version: string;
  /** Release notes, when the manifest carries some. */
  notes: string | null;
  /** RFC 3339 publish date, when the manifest carries one. */
  date: string | null;
}

export interface UpdateProgress {
  downloaded: number;
  /** Bytes to download, when the server said. */
  total: number | null;
  /** The installer is downloaded and installed; the app restarts next. */
  finished: boolean;
}

export class UpdateError extends Error {
  readonly cause: unknown;
  constructor(
    readonly stage: "check" | "install" | "relaunch",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "UpdateError";
    this.cause = options?.cause;
  }
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The update found by the last check, kept until installed or discarded
 * (it holds a resource on the Rust side). */
let pending: Update | null = null;

/** Forget the update the last check found. */
export async function discardUpdate(): Promise<void> {
  const update = pending;
  pending = null;
  await update?.close().catch(() => {});
}

/** Ask the server for a newer version: null when up to date, or outside the
 * desktop app (a browser tab can't update anything). */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauri()) return null;
  await discardUpdate();
  let update: Update | null;
  try {
    update = await check({ timeout: 15_000 });
  } catch (e) {
    throw new UpdateError("check", describe(e), { cause: e });
  }
  if (!update) return null;
  pending = update;
  return { version: update.version, notes: update.body ?? null, date: update.date ?? null };
}

/** Download and install the update the last check found, then restart the
 * app (Windows restarts on its own once the installer runs). */
export async function installUpdate(onProgress: (progress: UpdateProgress) => void, beforeRelaunch?: () => Promise<void>): Promise<void> {
  const update = pending;
  if (!update) throw new UpdateError("install", "No update to install: check for updates first.");
  let downloaded = 0;
  let total: number | null = null;
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? null;
      else if (event.event === "Progress") downloaded += event.data.chunkLength;
      onProgress({ downloaded, total, finished: event.event === "Finished" });
    });
  } catch (e) {
    throw new UpdateError("install", describe(e), { cause: e });
  }
  pending = null;
  // A pending debounced save would be lost: relaunch skips the window's
  // close handler, which is where the workspace is normally flushed.
  await beforeRelaunch?.();
  try {
    await relaunch();
  } catch (e) {
    throw new UpdateError("relaunch", describe(e), { cause: e });
  }
}
