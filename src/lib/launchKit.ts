import type { AiFieldReview, Album, AudioAnalysis, KitFieldId, Person, ProjectInfo, Snippet, SongMeta } from "../types";
import { detectKey, detectedPeople } from "./people";
import { KEYS, renderFreshness } from "./songs";

// The Launch Kit: everything a release needs, pre-filled from the project.
// Principles (docs/ROADMAP.md): fast by default, never a black box. Every
// field says where its value came from, every field can be edited or reset,
// and anything that can't be detected is asked once instead of guessed.

/** detected = read from the project; suggested = a reasonable default to
 * confirm; ai = written by the AI layer; edited = typed by the user;
 * missing = needs an answer. */
export type FieldSource = "detected" | "suggested" | "ai" | "edited" | "missing";

export interface Check {
  level: "warn" | "missing";
  message: string;
}

export interface KitField {
  id: KitFieldId;
  label: string;
  value: string;
  source: FieldSource;
  /** Where the value came from, in plain words. */
  note: string;
  kind: "text" | "multiline" | "date" | "choice";
  options?: string[];
  check?: Check;
  /** The AI layer's verdict; stale when the value changed since. */
  review?: AiFieldReview & { stale: boolean };
}

export interface KitInput {
  project: ProjectInfo;
  meta: SongMeta;
  people: Person[];
  albums: Album[];
  analysis: AudioAnalysis | null;
  today?: Date;
  /** Language the lyrics are in (Settings → AI language), for distributors. */
  language?: string | null;
  /** Default label: the crew's name, if in a crew. */
  labelName?: string | null;
  /** Release dates already taken (other releases, the crew's): avoided. */
  busyDates?: string[];
}

const DAY = 24 * 60 * 60 * 1000;
/** Lead time to deliver to a distributor and pitch to Spotify editorial,
 * which needs the track at least 7 days before release. */
const LEAD_DAYS = 28;
const PITCH_DAYS = 7;

const VERSION_TAG = /[\s_-]*[([]?\b(v\d+(\.\d+)?|final|master(ed)?|mixdown|demo|wip|copy)\b[)\]]?$/i;

/** "Night_Drive v3 (final)" → "Night Drive". */
export function cleanTitle(name: string): string {
  let t = name.replace(/_/g, " ").trim();
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t.replace(VERSION_TAG, "").trim();
  }
  return t || name;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** yyyy-mm-dd → local Date, or null. */
export function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

/** First Friday at least `days` from today. */
export function fridayAfter(today: Date, days: number): Date {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return d;
}

export function humanDate(value: string): string {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "[release date]";
}

function tempoFeel(bpm: number): string {
  if (bpm < 85) return "slow and heavy";
  if (bpm < 110) return "mid-tempo, laid back";
  if (bpm < 135) return "upbeat";
  return "fast, or a half-time feel";
}

function joinNames(names: string[]): string {
  return [...new Set(names)].join(", ");
}

/** "Ana feat. Ben": how the artist reads on a cover, a caption or a file name. */
export function artistLine(artists: string, featuring: string): string {
  return featuring.trim() ? `${artists} feat. ${featuring.trim()}` : artists;
}

/** Roles that write: lyrics (rap, vocals, topline) or music (production). */
const WRITER_ROLE = /writ|lyric|compos|author|rap|vocal|sing|mc|lead|artist|feat|prod|beat|topline/i;
const KIND_LABEL: Record<Album["kind"], string> = { single: "Single", ep: "EP", album: "Album", mixtape: "Mixtape" };
export const RELEASE_TYPES = ["Single", "EP", "Album", "Mixtape"];

/** Generated value + provenance for every field, before user edits. */
function generate(input: KitInput) {
  const { project, meta, people, albums, analysis, today = new Date() } = input;
  const name = (id: string) => people.find((p) => p.id === id)?.name;
  const credits = (meta.credits ?? []).map((c) => ({ ...c, name: name(c.personId) })).filter((c) => c.name);
  const byRole = (re: RegExp) => credits.filter((c) => re.test(c.role)).map((c) => c.name!);

  const g: Record<KitFieldId, { value: string; source: FieldSource; note: string }> = {} as never;

  const title = cleanTitle(project.name);
  const flpTitle = project.flpTitle?.trim();
  g.title = flpTitle
    ? { value: flpTitle, source: "detected", note: "From the title in FL Studio's project info" }
    : {
        value: title,
        source: "detected",
        note: title === project.name ? "From the project name" : `From the project name "${project.name}", version tag removed`,
      };

  // Distributors take featured artists separately from the main artist.
  const feats = byRole(/feat/i);
  const leads = byRole(/artist|rap|vocal|sing|mc|lead/i).filter((n) => !feats.includes(n));
  if (leads.length) {
    g.artists = { value: joinNames(leads), source: "detected", note: "From the song's credits" };
  } else if (project.artist?.trim()) {
    g.artists = { value: project.artist.trim(), source: "detected", note: "From the artist in FL Studio's project info" };
  } else {
    const found = detectedPeople(project, people).map((p) => p.name).filter((n) => !feats.includes(n));
    g.artists = found.length
      ? { value: joinNames(found), source: "suggested", note: "Found in mixer track names. Confirm who's the main artist" }
      : { value: "", source: "missing", note: "Credit the artist in the song panel, or type it here" };
  }
  g.featuring = feats.length
    ? { value: joinNames(feats), source: "detected", note: "Credited as feat. in the song panel" }
    : { value: "", source: "suggested", note: "No featured artist credited. Leave empty if there's none" };

  const writers = credits.filter((c) => WRITER_ROLE.test(c.role) && !/mix|master|engineer|design|photo/i.test(c.role));
  g.songwriters = writers.length
    ? {
        value: writers.map((c) => `${c.name} (${c.role})${c.split != null ? ` ${c.split}%` : ""}`).join("; "),
        source: "detected",
        note: "From the song's credits. Distributors want legal names, not artist names",
      }
    : { value: "", source: "missing", note: "Who wrote it? Legal names, separated by ;  e.g. Jane Doe (lyrics) 50%; John Roe (music) 50%" };

  const producers = byRole(/prod|beat/i);
  g.producers = producers.length
    ? { value: joinNames(producers), source: "detected", note: "From the song's credits" }
    : { value: "", source: "missing", note: "Credit a producer in the song panel, or type it here" };

  g.genre = project.genre
    ? { value: project.genre, source: "detected", note: "From the project info in FL Studio" }
    : { value: "Hip-Hop/Rap", source: "suggested", note: "Crew default. Change it if this one's different" };

  g.bpm =
    project.tempoBpm != null
      ? { value: String(Math.round(project.tempoBpm * 10) / 10), source: "detected", note: "From the .flp tempo" }
      : { value: "", source: "missing", note: "No tempo found in the project" };

  const typedKey = meta.key;
  const nameKey = detectKey(project.trackNames);
  g.key = typedKey
    ? { value: typedKey, source: "detected", note: "Set in the song panel" }
    : nameKey
      ? { value: nameKey, source: "suggested", note: "Written in a mixer track name" }
      : { value: "", source: "missing", note: "Not in the project. Optional, but playlists and DJs use it" };

  g.duration = analysis
    ? { value: formatDuration(analysis.durationSec), source: "detected", note: "Measured from the latest mixdown" }
    : { value: "", source: "missing", note: "Render a mixdown so it can be measured" };

  g.explicit = { value: "", source: "missing", note: "Can't be detected from audio. Answer once" };

  const album = albums.find((a) => a.trackPaths.includes(project.path) && a.releaseDate);
  if (album?.releaseDate) {
    g.releaseDate = { value: album.releaseDate, source: "detected", note: `From the release "${album.title}"` };
  } else {
    // First Friday with enough lead time that nobody else is releasing on.
    const busy = new Set(input.busyDates ?? []);
    let friday = fridayAfter(today, LEAD_DAYS);
    let skipped = 0;
    while (busy.has(isoDate(friday)) && skipped < 12) {
      friday = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + 7);
      skipped++;
    }
    g.releaseDate = {
      value: isoDate(friday),
      source: "suggested",
      note:
        `First Friday ${LEAD_DAYS}+ days out: time to deliver to the distributor and pitch to Spotify editorial` +
        (skipped ? `. Skipped ${skipped} Friday${skipped === 1 ? "" : "s"} that already ha${skipped === 1 ? "s" : "ve"} a release (yours or the crew's)` : ""),
    };
  }

  // Distribution details.
  const label = input.labelName?.trim();
  g.label = label
    ? { value: label, source: "suggested", note: "Your crew's name. Self-releasing? Your artist name works too" }
    : g.artists.value
      ? { value: g.artists.value.split(",")[0].trim(), source: "suggested", note: "Self-released: the artist name is the usual label" }
      : { value: "", source: "suggested", note: "Your label, or your artist name if self-released" };
  g.language = input.language?.trim()
    ? { value: input.language.trim(), source: "suggested", note: "Your language in Settings → AI. Change it if this song's different" }
    : { value: "", source: "missing", note: "The language of the lyrics (Instrumental if none). Distributors require it" };
  g.isrc = { value: "", source: "suggested", note: "Leave empty: your distributor assigns one for free. Fill it if this song already has one" };
  g.upc = { value: "", source: "suggested", note: "Leave empty: assigned for free with the release. Fill it to reuse an existing one" };
  const inAlbum = albums.find((a) => a.trackPaths.includes(project.path));
  g.releaseType = inAlbum
    ? { value: KIND_LABEL[inAlbum.kind], source: "detected", note: `From the release "${inAlbum.title}"` }
    : { value: "Single", source: "suggested", note: "Not part of a release in Releases, so a single" };
  g.trackNumber = inAlbum
    ? { value: String(inAlbum.trackPaths.indexOf(project.path) + 1), source: "detected", note: `Its place in "${inAlbum.title}"` }
    : { value: "1", source: "suggested", note: "A single is track 1" };
  // releaseTitle and copyright are derived from final values in buildKit.
  g.releaseTitle = inAlbum
    ? { value: inAlbum.title, source: "detected", note: "From Releases" }
    : { value: "", source: "suggested", note: "A single's release title is the song title" };
  g.copyright = { value: "", source: "suggested", note: "℗ line: release year + label. Edit if someone else owns the master" };

  return g;
}

/** The factual part of a cover brief (specs, distributor rules). Kept out
 * of the AI's hands: it's the same for every release. */
export function briefSpecs(title: string, artists: string): string[] {
  return [
    `Cover art brief: "${title}"${artists ? ` by ${artists}` : ""}`,
    "",
    "Format: square, 3000 × 3000 px, JPG or PNG, RGB.",
    "Distributors reject covers with URLs, social handles, prices or store logos, and any text must match the release title and artist name.",
  ];
}

/** Templates that use the final (possibly edited) values. */
function coverBrief(v: Record<KitFieldId, string>, meta: SongMeta): string {
  const bpm = Number(v.bpm);
  const minor = /m$/.test(v.key);
  const lines = [
    ...briefSpecs(v.title, artistLine(v.artists, v.featuring)),
    "",
    "Vibe cues from the project:",
    v.bpm && !Number.isNaN(bpm) ? `- Tempo: ${v.bpm} BPM (${tempoFeel(bpm)})` : null,
    v.key ? `- Key: ${v.key} (${minor ? "minor: darker, moodier" : "major: brighter, open"})` : null,
    meta.tags?.length ? `- Tags: ${meta.tags.join(", ")}` : null,
    meta.notes?.trim() ? `- Notes: ${meta.notes.trim().slice(0, 240)}` : null,
    "",
    "It has to work as a thumbnail: one strong subject, the title readable when the cover is 64 px wide.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function captions(v: Record<KitFieldId, string>): string {
  const who = artistLine(v.artists, v.featuring) || "[artist]";
  const prod = v.producers ? `\nprod. ${v.producers}` : "";
  const date = humanDate(v.releaseDate);
  return [
    `ANNOUNCE\n"${v.title}" by ${who}, out ${date}.\nPre-save link in bio.`,
    `TEASER (post with the Hook snippet)\nYou're not ready for this one. "${v.title}" drops ${date}.`,
    `RELEASE DAY\n"${v.title}" is out now everywhere.${prod}\nLink in bio.`,
  ].join("\n\n");
}

/** The verification layer. Deterministic sanity checks for now; an AI pass
 * (roadmap principle 2) plugs in here and returns the same Check shape. */
export function verify(id: KitFieldId, value: string, today = new Date()): Check | undefined {
  const v = value.trim();
  switch (id) {
    case "title":
      if (!v) return { level: "missing", message: "A release needs a title" };
      if (VERSION_TAG.test(v) || v.includes("_")) return { level: "warn", message: "Looks like a file name, not a release title" };
      return;
    case "artists":
      return v ? undefined : { level: "missing", message: "Who's the artist?" };
    case "producers":
      return v ? undefined : { level: "warn", message: "No producer credited" };
    case "genre":
      return v ? undefined : { level: "missing", message: "Distributors require a genre" };
    case "bpm": {
      if (!v) return { level: "warn", message: "No tempo" };
      const n = Number(v);
      if (Number.isNaN(n)) return { level: "warn", message: "Not a number" };
      if (n < 50 || n > 220) return { level: "warn", message: "Unusual tempo. Double or half time?" };
      return;
    }
    case "key":
      if (!v) return { level: "warn", message: "No key" };
      return KEYS.includes(v) ? undefined : { level: "warn", message: "Write it like Am, F# or Bb" };
    case "duration": {
      if (!v) return { level: "missing", message: "No mixdown to measure" };
      const m = /^(\d+):([0-5]\d)$/.exec(v);
      if (!m) return { level: "warn", message: "Write it as minutes:seconds, like 2:45" };
      return +m[1] * 60 + +m[2] < 30 ? { level: "warn", message: "Under 30 s: Spotify only counts a stream after 30 seconds" } : undefined;
    }
    case "explicit":
      return v === "Yes" || v === "No" ? undefined : { level: "missing", message: "Explicit lyrics? Yes or No" };
    case "releaseDate": {
      const d = parseDate(v);
      if (!d) return { level: "missing", message: "Pick a release date" };
      const days = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / DAY);
      if (days < 0) return { level: "warn", message: "That date is in the past" };
      if (days < PITCH_DAYS) return { level: "warn", message: "Under a week away: too late to pitch to Spotify editorial" };
      if (d.getDay() !== 5) return { level: "warn", message: "Not a Friday. New music drops worldwide on Fridays" };
      return;
    }
    case "coverBrief":
    case "captions":
      return /\[[^\]]+\]/.test(v) ? { level: "warn", message: "Fill in the [placeholders]" } : undefined;
    case "featuring":
      return;
    case "songwriters": {
      if (!v) return { level: "missing", message: "Distributors need the songwriters' legal names" };
      const parts = v.split(";").map((p) => p.trim()).filter(Boolean);
      const splits = parts.map((p) => /(\d+(?:[.,]\d+)?)\s*%/.exec(p)?.[1]).map((n) => (n ? Number(n.replace(",", ".")) : null));
      const given = splits.filter((n): n is number => n !== null);
      if (given.length && given.length < parts.length) return { level: "warn", message: "Give every writer a split, or none" };
      const sum = given.reduce((a, b) => a + b, 0);
      if (given.length && Math.abs(sum - 100) > 0.5) return { level: "warn", message: `Splits add up to ${Math.round(sum * 10) / 10}%, not 100%` };
      return;
    }
    case "label":
      return v ? undefined : { level: "warn", message: "No label: most distributors use the artist name" };
    case "copyright":
      return /\b(19|20)\d{2}\b/.test(v) ? undefined : { level: "warn", message: "Add the year, like ℗ 2026 Your Label" };
    case "language":
      return v ? undefined : { level: "missing", message: "Language of the lyrics (or Instrumental)" };
    case "isrc":
      return !v || /^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/i.test(v) ? undefined : { level: "warn", message: "An ISRC looks like FR-AB1-26-00001" };
    case "upc":
      return !v || /^\d{12,13}$/.test(v) ? undefined : { level: "warn", message: "A UPC/EAN is 12 or 13 digits" };
    case "releaseTitle":
      return v ? undefined : { level: "missing", message: "The release needs a title" };
    case "releaseType":
      return RELEASE_TYPES.includes(v) ? undefined : { level: "missing", message: "Single, EP, Album or Mixtape?" };
    case "trackNumber":
      return /^\d{1,3}$/.test(v) && Number(v) > 0 ? undefined : { level: "warn", message: "A track number, like 1" };
  }
}

const LABELS: Record<KitFieldId, string> = {
  title: "Title",
  artists: "Artist(s)",
  producers: "Producer(s)",
  genre: "Genre",
  bpm: "BPM",
  key: "Key",
  duration: "Duration",
  explicit: "Explicit lyrics",
  releaseDate: "Release date",
  coverBrief: "Cover art brief",
  captions: "Captions",
  featuring: "Featuring",
  songwriters: "Songwriters",
  label: "Label",
  copyright: "℗ / © line",
  language: "Lyrics language",
  isrc: "ISRC",
  upc: "UPC / EAN",
  releaseTitle: "Release title",
  releaseType: "Release type",
  trackNumber: "Track number",
};

/** What a distributor's upload form asks beyond the basics. */
export const DISTRIBUTION_FIELDS: KitFieldId[] = [
  "featuring",
  "songwriters",
  "releaseType",
  "releaseTitle",
  "trackNumber",
  "label",
  "copyright",
  "language",
  "isrc",
  "upc",
];

/** File name for the master and the sheet: "Ana feat. Ben - Night Run". */
export function masterBaseName(fields: KitField[], fallback: string): string {
  const get = (id: KitFieldId) => fields.find((f) => f.id === id)?.value ?? "";
  const title = get("title") || fallback;
  const who = artistLine(get("artists"), get("featuring"));
  return who ? `${who} - ${title}` : title;
}

export const METADATA_FIELDS: KitFieldId[] = ["title", "artists", "producers", "genre", "bpm", "key", "duration", "explicit"];

/** Every field with user edits applied and checked. */
export function buildKit(input: KitInput): KitField[] {
  const edits = input.meta.launchKit?.edits ?? {};
  const g = generate(input);
  const values = {} as Record<KitFieldId, string>;
  for (const id of Object.keys(g) as KitFieldId[]) values[id] = edits[id] ?? g[id].value;
  // Text pieces are generated from the final values, so editing the title
  // flows into the captions unless those were edited too.
  const ai = input.meta.launchKit?.ai;
  const drafts = ai?.drafts;
  values.releaseTitle = edits.releaseTitle ?? (g.releaseTitle.value || values.title);
  const year = /^(\d{4})-/.exec(values.releaseDate)?.[1] ?? String((input.today ?? new Date()).getFullYear());
  values.copyright = edits.copyright ?? (values.label ? `℗ ${year} ${values.label}` : "");
  values.coverBrief = edits.coverBrief ?? drafts?.coverBrief ?? coverBrief(values, input.meta);
  values.captions = edits.captions ?? drafts?.captions ?? captions(values);
  // AI text bakes in the title/artist/date it was written for.
  const basis = drafts?.basis;
  const draftsOutdated =
    !!basis && (basis.title !== values.title || basis.artists !== values.artists || basis.releaseDate !== values.releaseDate);

  const field = (id: KitFieldId, kind: KitField["kind"], gen: { source: FieldSource; note: string }, options?: string[]): KitField => {
    const edited = edits[id] !== undefined;
    const review = ai?.review?.fields[id];
    const outdated = draftsOutdated && !edited && (id === "captions" || id === "coverBrief");
    return {
      id,
      label: LABELS[id],
      value: values[id],
      source: edited ? "edited" : gen.source,
      note: edited ? "You changed this" : gen.note,
      kind,
      options,
      check: outdated
        ? { level: "warn", message: "Written for the old title, artist or date. Rewrite with AI or edit it" }
        : verify(id, values[id], input.today),
      review: review && { ...review, stale: outdated || review.checkedValue !== values[id] },
    };
  };
  const drafted = drafts
    ? { source: "ai" as const, note: `Written by ${drafts.model}, then checked` }
    : { source: "suggested" as const, note: "Drafted from the fields above" };
  return [
    field("title", "text", g.title),
    field("artists", "text", g.artists),
    field("producers", "text", g.producers),
    field("genre", "text", g.genre),
    field("bpm", "text", g.bpm),
    field("key", "text", g.key),
    field("duration", "text", g.duration),
    field("explicit", "choice", g.explicit, ["Yes", "No"]),
    field("releaseDate", "date", g.releaseDate),
    field("coverBrief", "multiline", drafted),
    field("captions", "multiline", drafted),
    field("featuring", "text", g.featuring),
    field("songwriters", "text", g.songwriters),
    field("releaseType", "choice", g.releaseType, RELEASE_TYPES),
    field("releaseTitle", "text", g.releaseTitle.value ? g.releaseTitle : { source: "suggested", note: "Same as the song title (a single)" }),
    field("trackNumber", "text", g.trackNumber),
    field("label", "text", g.label),
    field("copyright", "text", g.copyright),
    field("language", "text", g.language),
    field("isrc", "text", g.isrc),
    field("upc", "text", g.upc),
  ];
}

/** Below this, an AI verdict is shown as low confidence. */
export const LOW_CONFIDENCE = 0.6;

/** Where the AI check stands for the whole kit. */
export function aiSummary(fields: KitField[]): {
  state: "unchecked" | "stale" | "checked";
  flagged: number;
  /** Fields the model skipped in its last answer. */
  skipped: number;
  verified: boolean;
} {
  const reviewed = fields.filter((f) => f.review);
  if (reviewed.length === 0) return { state: "unchecked", flagged: 0, skipped: 0, verified: false };
  const fresh = reviewed.filter((f) => !f.review!.stale);
  const flagged = fresh.filter((f) => f.review!.verdict !== "ok" || f.review!.confidence < LOW_CONFIDENCE).length;
  const skipped = fields.length - reviewed.length;
  const state = fresh.length < reviewed.length ? "stale" : "checked";
  return { state, flagged, skipped, verified: state === "checked" && skipped === 0 && flagged === 0 };
}

/** Kit-level problems that aren't one field's. */
export function kitChecks(project: ProjectInfo): Check[] {
  const freshness = renderFreshness(project);
  if (freshness === "none") return [{ level: "missing", message: "No mixdown yet. Render one: it's the file you'll upload" }];
  if (freshness === "stale") return [{ level: "warn", message: "The project was saved after the latest mixdown. Re-render before exporting" }];
  return [];
}

/** Snippets with the user's nudges applied. */
export function kitSnippets(analysis: AudioAnalysis | null, meta: SongMeta): Snippet[] {
  const starts = meta.launchKit?.snippetStarts ?? {};
  return (analysis?.snippets ?? []).map((s) => ({ ...s, startSec: starts[s.label] ?? s.startSec }));
}

// Quoted, and a leading = + - @ is defused so spreadsheets don't run it.
const csvCell = (s: string) => `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;

/** The text files of an exported kit. */
export function kitFiles(fields: KitField[], snippets: Snippet[], extra: Check[]): { name: string; content: string }[] {
  const get = (id: KitFieldId) => fields.find((f) => f.id === id)?.value ?? "";
  const meta = METADATA_FIELDS.concat("releaseDate", DISTRIBUTION_FIELDS);
  const aiFlags: Check[] = fields.flatMap((f) =>
    f.review && !f.review.stale && (f.review.verdict !== "ok" || f.review.confidence < LOW_CONFIDENCE)
      ? [{ level: "warn" as const, message: `${f.label}: AI says ${f.review.reason || f.review.verdict}` }]
      : [],
  );
  const open = [...extra, ...fields.flatMap((f) => (f.check ? [{ ...f.check, message: `${f.label}: ${f.check.message}` }] : [])), ...aiFlags];
  const json = {
    ...Object.fromEntries(meta.map((id) => [id, get(id)])),
    snippets: snippets.map((s) => ({ file: `snippets/${s.label}.wav`, startSec: s.startSec, lengthSec: s.lengthSec })),
    openChecks: open.map((c) => `${c.level}: ${c.message}`),
    generatedAt: new Date().toISOString(),
  };
  return [
    { name: "metadata.json", content: JSON.stringify(json, null, 2) },
    {
      name: "metadata.csv",
      // BOM so Excel reads accented names (é, ñ) as UTF-8.
      content: "﻿" + [meta.map((id) => csvCell(LABELS[id])).join(","), meta.map((id) => csvCell(get(id))).join(",")].join("\n") + "\n",
    },
    { name: "distributor-sheet.md", content: distributorSheet(get, snippets, open, masterBaseName(fields, get("title"))) },
    { name: "cover-brief.md", content: get("coverBrief") + "\n" },
    { name: "captions.md", content: get("captions") + "\n" },
    {
      name: "checklist.md",
      content:
        `# ${get("title")}: before you upload\n\n` +
        (open.length ? open.map((c) => `- [ ] ${c.message}`).join("\n") : "- [x] All checks passed") +
        "\n",
    },
  ];
}

/** Every value in the order distributors' upload forms ask for it, ready to
 * copy field by field (DistroKid, TuneCore, CD Baby, Amuse…). */
function distributorSheet(get: (id: KitFieldId) => string, snippets: Snippet[], open: Check[], master: string): string {
  const or = (v: string, empty: string) => v.trim() || empty;
  const hook = snippets.find((s) => /hook/i.test(s.label)) ?? snippets[0];
  const writers = get("songwriters")
    .split(";")
    .map((w) => w.trim())
    .filter(Boolean);
  const lines = [
    `# Distributor sheet: "${get("title")}"`,
    "",
    "Copy each value into your distributor's upload form. Optional fields left empty: leave them blank there too.",
    "",
    "## Release",
    `- Release type: ${or(get("releaseType"), "Single")}`,
    `- Release title: ${or(get("releaseTitle"), get("title"))}`,
    `- Release date: ${get("releaseDate")}${get("releaseDate") ? ` (${humanDate(get("releaseDate"))})` : ""}`,
    `- Label: ${or(get("label"), "(your artist name)")}`,
    `- ℗ / © line: ${or(get("copyright"), "(year + label)")}`,
    `- UPC / EAN: ${or(get("upc"), "(leave empty: assigned for free)")}`,
    "",
    `## Track ${or(get("trackNumber"), "1")}`,
    `- Track title: ${get("title")}`,
    `- Primary artist(s): ${get("artists")}`,
    `- Featured artist(s): ${or(get("featuring"), "(none)")}`,
    `- Songwriters (legal names):${writers.length ? "\n" + writers.map((w) => `  - ${w}`).join("\n") : " (missing)"}`,
    `- Producer(s): ${or(get("producers"), "(none credited)")}`,
    `- Genre: ${get("genre")}`,
    `- Lyrics language: ${or(get("language"), "(missing)")}`,
    `- Explicit: ${or(get("explicit"), "(answer Yes or No)")}`,
    `- ISRC: ${or(get("isrc"), "(leave empty: assigned for free)")}`,
    hook ? `- Preview / TikTok start: ${formatDuration(hook.startSec)} (the ${hook.label} snippet)` : null,
    `- BPM / key: ${[get("bpm"), get("key")].filter(Boolean).join(" / ") || "(not needed)"}`,
    `- Duration: ${get("duration")}`,
    "",
    "## Files",
    `- Audio: "${master}" in this folder. Distributors want WAV, 16 or 24-bit, 44.1 kHz.`,
    "- Cover: 3000 × 3000 px JPG, RGB. cover-concept.jpg is a draft to brief the designer, not the final cover.",
    "",
    "## Before you submit",
    open.length ? open.map((c) => `- [ ] ${c.message}`).join("\n") : "- [x] All checks passed",
  ];
  return lines.filter((l) => l !== null).join("\n") + "\n";
}

/** Plausible analysis for sample data (no real audio): verse/hook shape. */
export function demoAnalysis(project: ProjectInfo): AudioAnalysis {
  let seed = [...project.path].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const windowSec = 0.5;
  const durationSec = 150 + Math.floor(rand() * 60);
  const energy = Array.from({ length: durationSec / windowSec }, (_, i) => {
    const t = i * windowSec;
    const section = Math.floor(t / 20) % 3 === 1 ? 0.95 : 0.6; // hooks every third 20s block
    const edge = Math.min(1, t / 8, (durationSec - t) / 8);
    return Math.max(0.05, (section + rand() * 0.08) * edge);
  });
  const loudest = (len: number, skip?: [number, number]) => {
    const n = len / windowSec;
    let best = -1;
    let bestSum = -1;
    for (let i = 0; i + n <= energy.length; i++) {
      if (skip && i < skip[1] && i + n > skip[0]) continue;
      const sum = energy.slice(i, i + n).reduce((a, b) => a + b, 0);
      if (sum > bestSum) [best, bestSum] = [i, sum];
    }
    return best * windowSec;
  };
  const hook = loudest(15);
  return {
    durationSec,
    windowSec,
    energy,
    snippets: [
      { label: "Hook 15s", startSec: hook, lengthSec: 15 },
      { label: "Teaser 30s", startSec: loudest(30), lengthSec: 30 },
      { label: "Alt 15s", startSec: loudest(15, [hook / windowSec, (hook + 15) / windowSec]), lengthSec: 15 },
    ],
  };
}
