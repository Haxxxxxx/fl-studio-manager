// What to do when Google's code scanner (CameraView.launchScanner) fails.
// expo-camera reports any exception while starting it as "Google Play
// Services is not available", whatever the real cause, so every failure but
// a cancel falls back to the in-app camera instead of a dead end.

export type ScannerFailure = "cancelled" | "fallback";

export function scannerFailure(e: unknown): ScannerFailure {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /cancel/i.test(code) || /cancel/i.test(message) ? "cancelled" : "fallback";
}
