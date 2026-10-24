// Turning the updater's raw failures into something a person can act on.
// Pure, so it stays testable without the Tauri plugins.

/** macOS said the app bundle can't be written: Hivo runs from the mounted
 * disk image, or from the read-only copy Gatekeeper makes of a downloaded,
 * unnotarized app ("App Translocation"). Moving it to Applications with
 * Finder fixes both. */
export function isReadOnlyInstallError(message: string | undefined): boolean {
  if (!message) return false;
  return /read-only file system|os error 30\b|EROFS/i.test(message);
}
