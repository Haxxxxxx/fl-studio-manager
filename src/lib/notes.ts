// Notes on the Digger's saved prods and beats (phase B, step 1: the desktop
// holds every note; the phone app will sync to it). Kept in the workspace,
// keyed by the saved prod's url hash (`leadHash`) or the beat's file path,
// never inside the lead files, so re-saving a prod never wipes them.

/** Same cap as a song's notes field would sensibly hold: a full set of lyrics. */
export const MAX_NOTE_CHARS = 20_000;

/** The map with `key` set to `text` as typed (capped; never trimmed, it's
 * called on every keystroke), or without `key` when the text is blank.
 * Never mutates the input. */
export function setNote(map: Record<string, string> | undefined, key: string, text: string): Record<string, string> {
  const next = { ...(map ?? {}) };
  const value = text.slice(0, MAX_NOTE_CHARS);
  if (value.trim()) next[key] = value;
  else delete next[key];
  return next;
}

/** The first non-empty line, for a collapsed preview. */
export function notePreview(text: string | undefined, max = 80): string {
  const line = (text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
