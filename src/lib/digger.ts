// Pure helpers for the Digger: search links and starter queries from beat
// file names. Links only: the Digger never downloads anything.

/** Same limit as `MAX_QUERY_CHARS` in src-tauri/src/youtube.rs. */
export const MAX_QUERY_CHARS = 120;

/** A YouTube search page for `query` (opened in the browser, no key needed). */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim().replace(/\s+/g, " "))}`;
}

/** A Google search page for `query` (the searches behind the dig's web links). */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim().replace(/\s+/g, " "))}`;
}

/** Same limit as `MAX_EXCLUDE` in src-tauri/src/digger.rs. */
export const MAX_EXCLUDE = 50;

/** Same limit as `MAX_KEY_CHARS` in src-tauri/src/digger.rs. */
const MAX_KEY_CHARS = 120;

/** How a found beat is remembered between rounds: "title | site", lowercased
 * (same as `found_key` in Rust). Not the url: Google Search grounding hands
 * out a fresh redirect link for the same page every time. */
export function foundKey(link: { text: string; site: string }): string {
  return `${link.text.trim()} | ${link.site.trim()}`.toLowerCase().slice(0, MAX_KEY_CHARS);
}

/** The beats a "Go deeper" round must skip: the first dig's, then every round's, deduplicated. */
export function deeperExclude(first: { text: string; site: string }[], rounds: { text: string; site: string }[][]): string[] {
  return [...new Set([first, ...rounds].flat().map(foundKey))].slice(0, MAX_EXCLUDE);
}

/**
 * The video ID of a YouTube link (watch?v=, youtu.be/, /shorts/), or null for
 * anything else. Only an ID ever reaches the embedded player.
 */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else if (u.pathname.startsWith("/shorts/")) id = u.pathname.slice("/shorts/".length).split("/")[0];
  } else if (host === "youtu.be") {
    id = u.pathname.slice(1).split("/")[0];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** "140 BPM · Am · 3:05" for one analysed beat; "≈" marks an estimated tempo. */
export function beatFactsLine(f: { bpm: number | null; bpmSource: string | null; key: string | null; durationSec: number }): string {
  const parts: string[] = [];
  if (f.bpm) parts.push(`${f.bpmSource === "audio" ? "≈" : ""}${Math.round(f.bpm)} BPM`);
  if (f.key) parts.push(f.key);
  const s = Math.round(f.durationSec);
  parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
  return parts.join(" · ");
}

/** Noise YouTube uploaders put in beat titles. */
const NOISE = /\b(free|for profit|non profit|download|hq|hd|official|audio|instrumental|\d{2,3}\s?bpm|20\d\d)\b/gi;

/**
 * A beat file name turned into a search: brackets, `(prod. X)` and upload
 * noise dropped, separators made spaces, "type beat" kept or added.
 * "[FREE] Dark Trap Type Beat - "Night" (prod. X) 140bpm" → "Dark Trap Type Beat Night".
 */
export function beatQuery(name: string): string {
  let q = name
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?:prod|produced)[^)]*\)/gi, " ")
    .replace(/\b(?:prod|produced)\.?\s+by\b.*$/i, " ")
    .replace(/\bprod\.\s+.*$/i, " ")
    .replace(/[()"“”|_~*#@]+/g, " ")
    .replace(/\s[-–—]\s|\s[-–—]|[-–—]\s/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!q) return "";
  if (!/\bbeat\b/i.test(q)) q = `${q} type beat`;
  return q.slice(0, MAX_QUERY_CHARS).trim();
}
