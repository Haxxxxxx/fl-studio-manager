// The session view (teleprompter): a song's, beat's or saved prod's notes,
// large, section by section, in a window kept on top of FL Studio. Pure
// helpers; the window is src/components/SessionWindow.tsx, the main window's
// side src/store/sessionBridge.ts.

import { parseNoteSections } from "./lyrics";

export interface SessionSection {
  /** `[Hook]` → "Hook"; null for lines before the first heading. */
  heading: string | null;
  lines: string[];
}

export interface SessionTarget {
  kind: "song" | "beat" | "prod";
  id: string;
  title: string;
  bpm: number | null;
}

/** What the main window sends the session window. */
export interface SessionPayload extends SessionTarget {
  text: string;
  /** The song/beat/prod isn't there any more: the window keeps the last text. */
  gone: boolean;
  lang: "en" | "fr";
}

/** The note cut at its `[Section]` headings; blank lines dropped. A note
 * without headings is one section. Empty sections (a heading with no lines)
 * are kept: they mark where the verse goes. */
export function sessionSections(text: string): SessionSection[] {
  const out: SessionSection[] = [];
  for (const l of parseNoteSections(text)) {
    if (l.kind === "heading") out.push({ heading: l.text, lines: [] });
    else if (l.kind === "line") {
      if (out.length === 0) out.push({ heading: null, lines: [] });
      out[out.length - 1].lines.push(l.text);
    }
  }
  return out;
}

export const DEFAULT_BPM = 90;

/** One bar of 4/4 at this tempo, in ms (the auto-scroll moves one line per
 * bar). Unknown or odd tempos fall back to 90 BPM; half/double-time stays as
 * given within 40-240. */
export function barMs(bpm: number | null): number {
  const b = bpm !== null && Number.isFinite(bpm) && bpm >= 40 && bpm <= 240 ? bpm : DEFAULT_BPM;
  return Math.round((4 * 60_000) / b);
}

/** A position in the lyrics: section and line inside it. */
export interface Cursor {
  section: number;
  line: number;
}

/** The next line (crossing into the next section), or null at the end. */
export function nextLine(sections: SessionSection[], c: Cursor): Cursor | null {
  if (sections.length === 0) return null;
  if (c.line + 1 < (sections[c.section]?.lines.length ?? 0)) return { section: c.section, line: c.line + 1 };
  for (let s = c.section + 1; s < sections.length; s++) if (sections[s].lines.length > 0) return { section: s, line: 0 };
  return null;
}

/** Section ± step, clamped; the line goes back to the section's start. */
export function moveSection(sections: SessionSection[], c: Cursor, step: number): Cursor {
  if (sections.length === 0) return { section: 0, line: 0 };
  const section = Math.min(sections.length - 1, Math.max(0, c.section + step));
  return { section, line: 0 };
}

/** Keeps a cursor valid after the text changed (typing in the main window). */
export function clampCursor(sections: SessionSection[], c: Cursor): Cursor {
  if (sections.length === 0) return { section: 0, line: 0 };
  const section = Math.min(c.section, sections.length - 1);
  const lines = sections[section].lines.length;
  return { section, line: lines === 0 ? 0 : Math.min(c.line, lines - 1) };
}

export const FONT_SIZES = [20, 24, 28, 34, 40, 48, 56];
