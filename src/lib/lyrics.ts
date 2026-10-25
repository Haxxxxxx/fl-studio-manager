// Reading a note as lyrics (the notes panel's Read mode): `[Hook]`-style
// lines become section headings, other lines carry a rough syllable count
// to check the flow. Pure helpers, no UI.

/** One line of a note, as the Read mode shows it. */
export type NoteLine =
  | { kind: "heading"; text: string }
  | { kind: "line"; text: string; syllables: number }
  | { kind: "blank" };

/** A line that is only `[Something]` (spaces around allowed): a section heading. */
const HEADING = /^\s*\[([^\][\n]+)\]\s*$/;

/** The note line by line: `[Verse 1]` alone on a line → a heading (its inner
 * text, trimmed), an empty or blank line → spacing, anything else → a line
 * with its syllable count. Runs of blank lines collapse into one, and blank
 * lines at the start and the end are dropped. */
export function parseNoteSections(text: string | undefined): NoteLine[] {
  const out: NoteLine[] = [];
  for (const raw of (text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const heading = HEADING.exec(raw);
    if (heading) out.push({ kind: "heading", text: heading[1].trim() });
    else if (!raw.trim()) {
      if (out.length > 0 && out[out.length - 1].kind !== "blank") out.push({ kind: "blank" });
    } else out.push({ kind: "line", text: raw.trimEnd(), syllables: syllableCount(raw) });
  }
  while (out.length > 0 && out[out.length - 1].kind === "blank") out.pop();
  return out;
}

const VOWELS = /[aeiouyàâäéèêëîïôöùûüÿæœ]+/g;
const WORD = /[\p{L}]+/gu;

/** Syllables in one word: vowel groups, minus a mute final "e"/"es" after a
 * consonant (English "make", French "rime"), at least 1. A heuristic for
 * English and French, good enough to compare two lines, not to scan poetry. */
function wordSyllables(word: string): number {
  const w = word.toLowerCase();
  let n = w.match(VOWELS)?.length ?? 0;
  if (n > 1 && /[^aeiouyàâäéèêëîïôöùûüÿæœ]es?$/.test(w)) n -= 1;
  return Math.max(1, n);
}

/** A rough syllable count for a line of English or French lyrics: every word
 * (letters only; "j'suis" is two words) counts at least one. 0 for a line
 * without letters. */
export function syllableCount(line: string): number {
  let total = 0;
  for (const word of line.match(WORD) ?? []) total += wordSyllables(word);
  return total;
}
