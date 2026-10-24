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

/** Same limit as `MAX_SEARCHES_DONE` in src-tauri/src/digger.rs. */
export const MAX_SEARCHES_DONE = 50;

/** Every search the rounds ran so far (the seed's go separately), once each, capped. */
export function searchesDone(rounds: { queries: string[] }[]): string[] {
  return [...new Set(rounds.flatMap((r) => r.queries).map((q) => q.trim()).filter(Boolean))].slice(0, MAX_SEARCHES_DONE);
}

/** Same limits as `MAX_FOUND_TITLES` / `MAX_TITLE_CHARS` in src-tauri/src/digger.rs. */
export const MAX_FOUND_TITLES = 50;
export const MAX_TITLE_CHARS = 120;

/** `title` the way the prompts get it: trimmed, one space between words, clipped. */
function cleanTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, MAX_TITLE_CHARS);
}

/** `titles` cleaned, blanks and repeats (any case) dropped, at most `max`. */
function cleanTitles(titles: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of titles) {
    const t = cleanTitle(raw);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** The titles already shown, for a "Go deeper" round without Google Search:
 * trimmed, clipped, blanks and repeats (any case) dropped, capped. */
export function foundTitles(titles: string[]): string[] {
  return cleanTitles(titles, MAX_FOUND_TITLES);
}

/** Same limit as `MAX_LIKED` in src-tauri/src/digger.rs. */
export const MAX_LIKED = 20;

/** A result picked for the next round to go closer to ("Use for next dig"):
 * a YouTube video id or a web link url, and the title the prompt will see. */
export interface Liked {
  id: string;
  title: string;
}

/** `liked` with `id` toggled: dropped when there, added (title cleaned)
 * unless the list is full. */
export function toggleLiked(liked: Liked[], id: string, title: string): Liked[] {
  if (liked.some((l) => l.id === id)) return liked.filter((l) => l.id !== id);
  if (liked.length >= MAX_LIKED) return liked;
  return [...liked, { id, title: cleanTitle(title) || id }];
}

/** The picks' titles for a "Go deeper" round: same cleaning as `foundTitles`, capped at MAX_LIKED. */
export function likedTitles(liked: Liked[]): string[] {
  return cleanTitles(liked.map((l) => l.title), MAX_LIKED);
}

/** The picks a round was seeded from, short enough for a tooltip: the first 3, then "+n". */
export function seedList(seeds: string[]): string {
  const rest = seeds.length - 3;
  return seeds.slice(0, 3).join(", ") + (rest > 0 ? ` +${rest}` : "");
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
