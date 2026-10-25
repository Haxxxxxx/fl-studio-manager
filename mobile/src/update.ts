// Fetching side of the update check (pure rules in lib/update.ts). Only
// builds for the website ("direct") check: the Play build (HIVO_DISTRIBUTION
// =play, see app.config.js) leaves updates to Google Play, as Play's
// policy requires. Nothing is sent but a plain GET of a public file.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { checkDue, MANIFEST_URL, pickUpdate, type Update } from "./lib/update";
import { appVersion } from "./store";

const LAST_CHECK_KEY = "hivo.update.lastCheck.v1";
const DISMISSED_KEY = "hivo.update.dismissed.v1";
const TIMEOUT_MS = 8000;

export function checksForUpdates(): boolean {
  return Constants.expoConfig?.extra?.distribution !== "play";
}

/** The update to offer now, or null (Play build, checked today, offline, nothing newer, dismissed). */
export async function checkForUpdate(now = Date.now()): Promise<Update | null> {
  if (!checksForUpdates()) return null;
  const [last, dismissed] = await Promise.all([AsyncStorage.getItem(LAST_CHECK_KEY), AsyncStorage.getItem(DISMISSED_KEY)]);
  if (!checkDue(last === null ? null : Number(last), now)) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let manifest: unknown;
  try {
    const res = await fetch(MANIFEST_URL, { signal: ctrl.signal, cache: "no-store" });
    // 404 before the first phone release: a real answer, counts as checked.
    if (!res.ok) {
      await AsyncStorage.setItem(LAST_CHECK_KEY, String(now));
      return null;
    }
    manifest = await res.json();
  } catch (e) {
    // Offline or timed out: try again on the next launch, say nothing.
    console.warn("update check failed:", e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
  await AsyncStorage.setItem(LAST_CHECK_KEY, String(now));
  return pickUpdate(manifest, appVersion(), dismissed);
}

/** "Later": this version isn't offered again; a newer one will be. */
export async function dismissUpdate(version: string): Promise<void> {
  await AsyncStorage.setItem(DISMISSED_KEY, version);
}
