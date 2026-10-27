// What to do when Google's code scanner (CameraView.launchScanner) fails.
// expo-camera reports any exception while starting it as "Google Play
// Services is not available", whatever the real cause, so every failure but
// a cancel falls back to the in-app camera instead of a dead end.

/** How long the in-app camera tries before handing over to the camera app. */
export const SCAN_TIMEOUT_MS = 12_000;

/** Opens the phone's camera app; declared in <queries> by plugins/withPlayServicesVisibility.js. */
export const CAMERA_APP_INTENT = "android.media.action.STILL_IMAGE_CAMERA";

export type ScannerFailure = "cancelled" | "fallback";

export function scannerFailure(e: unknown): ScannerFailure {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /cancel/i.test(code) || /cancel/i.test(message) ? "cancelled" : "fallback";
}
