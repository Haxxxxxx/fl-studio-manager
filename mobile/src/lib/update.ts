// The phone app's update check (website APK builds only; Play installs get
// their updates from Play). On launch, at most once a day, the app reads
// mobile-latest.json from the public `releases` bucket, written by the
// release workflow:
//   { "version": "0.6.1", "apk": "<url>", "sha256": "<hex>", "notes": "…", "pub_date": "<iso>" }
// Pure helpers here; fetching and storage live in src/update.ts.

/** Same project the desktop updater and the website's /download/* use. */
export const RELEASES_BASE = "https://chrbpaoljulntuvousnz.supabase.co/storage/v1/object/public/releases/";
export const MANIFEST_URL = `${RELEASES_BASE}mobile-latest.json`;
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export type Semver = readonly [major: number, minor: number, patch: number];

/** "0.6.1" or "v0.6.1" → [0, 6, 1]; anything else (pre-releases included) → null. */
export function parseSemver(v: unknown): Semver | null {
  if (typeof v !== "string") return null;
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1, 0 or 1 like a sort comparator; null when either isn't x.y.z. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const x = parseSemver(a);
  const y = parseSemver(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}

export type Update = { version: string; apk: string };

/**
 * The update to offer, or null: the manifest must be well formed, newer
 * than the running app, not dismissed, and its APK must sit in the releases
 * bucket (never a link to anywhere else, whatever the file says).
 */
export function pickUpdate(manifest: unknown, current: string, dismissed: string | null): Update | null {
  if (!manifest || typeof manifest !== "object") return null;
  const { version, apk } = manifest as Record<string, unknown>;
  if (typeof version !== "string" || typeof apk !== "string") return null;
  if (compareSemver(version, current) !== 1) return null;
  if (dismissed !== null && compareSemver(version, dismissed) !== 1) return null;
  if (!apk.startsWith(RELEASES_BASE) || !apk.endsWith(".apk") || /[\s?#]|\.\./.test(apk)) return null;
  return { version: version.trim().replace(/^v/, ""), apk };
}

/** True when the last check is a day old (or never happened, or the clock went back). */
export function checkDue(lastCheckAt: number | null, now: number): boolean {
  if (lastCheckAt === null || !Number.isFinite(lastCheckAt)) return true;
  return now - lastCheckAt >= CHECK_EVERY_MS || now < lastCheckAt;
}
