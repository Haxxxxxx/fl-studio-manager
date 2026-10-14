// The emailed sign-in code. Supabase sends 6 to 8 digits depending on the
// project's "Email OTP length" setting, so accept the whole range: a length
// mismatch must never lock anyone out.

export const CODE_MIN = 6;
export const CODE_MAX = 8;

/** Digits only (pasting "123 456" or "123-456" works), capped at CODE_MAX. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_MAX);
}

export function isCodeComplete(code: string): boolean {
  return /^\d+$/.test(code) && code.length >= CODE_MIN && code.length <= CODE_MAX;
}
