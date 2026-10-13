import type { Album, AudioAnalysis, KitFieldId, Person, ProjectInfo, Snippet, SongMeta } from "../types";
import { detectKey, detectedPeople } from "./people";
import { KEYS, renderFreshness } from "./songs";

// The Launch Kit: everything a release needs, pre-filled from the project.
// Principles (docs/ROADMAP.md): fast by default, never a black box. Every
// field says where its value came from, every field can be edited or reset,
// and anything that can't be detected is asked once instead of guessed.

/** detected = read from the project; suggested = a reasonable default to
 * confirm; edited = typed by the user; missing = needs an answer. */
export type FieldSource = "detected" | "suggested" | "edited" | "missing";

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
}

export interface KitInput {
  project: ProjectInfo;
  meta: SongMeta;
  people: Person[];
  albums: Album[];
  analysis: AudioAnalysis | null;
  today?: Date;
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

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** yyyy-mm-dd → local Date, or null. */
function parseDate(value: string): Date | null {
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

/** Generated value + provenance for every field, before user edits. */
function generate({ project, meta, people, albums, analysis, today = new Date() }: KitInput) {
  const name = (id: string) => people.find((p) => p.id === id)?.name;
  const credits = (meta.credits ?? []).map((c) => ({ ...c, name: name(c.personId) })).filter((c) => c.name);
  const byRole = (re: RegExp) => credits.filter((c) => re.test(c.role)).map((c) => c.name!);

  const g: Record<KitFieldId, { value: string; source: FieldSource; note: string }> = {} as never;

  const title = cleanTitle(project.name);
  g.title = {
    value: title,
    source: "detected",
    note: title === project.name ? "From the project name" : `From the project name "${project.name}", version tag removed`,
  };

  const feats = byRole(/feat/i);
  const leads = byRole(/artist|rap|vocal|sing|mc|lead/i).filter((n) => !feats.includes(n));
  const featPart = feats.length ? ` feat. ${joinNames(feats)}` : "";
  if (leads.length) {
    g.artists = { value: joinNames(leads) + featPart, source: "detected", note: "From the song's credits" };
  } else {
    const found = detectedPeople(project, people).map((p) => p.name);
    g.artists = found.length
      ? { value: joinNames(found) + featPart, source: "suggested", note: "Found in mixer track names. Confirm who's the main artist" }
      : { value: "", source: "missing", note: "Credit the artist in the song panel, or type it here" };
  }

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
  g.releaseDate = album?.releaseDate
    ? { value: album.releaseDate, source: "detected", note: `From the release "${album.title}"` }
    : {
        value: isoDate(fridayAfter(today, LEAD_DAYS)),
        source: "suggested",
        note: `First Friday ${LEAD_DAYS}+ days out: time to deliver to the distributor and pitch to Spotify editorial`,
      };

  return g;
}

/** Templates that use the final (possibly edited) values. */
function coverBrief(v: Record<KitFieldId, string>, meta: SongMeta): string {
  const bpm = Number(v.bpm);
  const minor = /m$/.test(v.key);
  const lines = [
    `Cover art brief: "${v.title}"${v.artists ? ` by ${v.artists}` : ""}`,
    "",
    "Format: square, 3000 × 3000 px, JPG or PNG, RGB.",
    "Distributors reject covers with URLs, social handles, prices or store logos, and any text must match the release title and artist name.",
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
  const who = v.artists || "[artist]";
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
      const [m, s] = v.split(":").map(Number);
      return m * 60 + s < 30 ? { level: "warn", message: "Under 30 s: Spotify only counts a stream after 30 seconds" } : undefined;
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
};

export const METADATA_FIELDS: KitFieldId[] = ["title", "artists", "producers", "genre", "bpm", "key", "duration", "explicit"];

/** Every field with user edits applied and checked. */
export function buildKit(input: KitInput): KitField[] {
  const edits = input.meta.launchKit?.edits ?? {};
  const g = generate(input);
  const values = {} as Record<KitFieldId, string>;
  for (const id of Object.keys(g) as KitFieldId[]) values[id] = edits[id] ?? g[id].value;
  // Text pieces are generated from the final values, so editing the title
  // flows into the captions unless those were edited too.
  const brief = coverBrief(values, input.meta);
  const caps = captions(values);
  values.coverBrief = edits.coverBrief ?? brief;
  values.captions = edits.captions ?? caps;

  const field = (id: KitFieldId, kind: KitField["kind"], gen: { source: FieldSource; note: string }, options?: string[]): KitField => {
    const edited = edits[id] !== undefined;
    return {
      id,
      label: LABELS[id],
      value: values[id],
      source: edited ? "edited" : gen.source,
      note: edited ? "You changed this" : gen.note,
      kind,
      options,
      check: verify(id, values[id], input.today),
    };
  };
  const drafted = { source: "suggested" as const, note: "Drafted from the fields above" };
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
  ];
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

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** The text files of an exported kit. */
export function kitFiles(fields: KitField[], snippets: Snippet[], extra: Check[]): { name: string; content: string }[] {
  const get = (id: KitFieldId) => fields.find((f) => f.id === id)?.value ?? "";
  const meta = METADATA_FIELDS.concat("releaseDate");
  const open = [...extra, ...fields.flatMap((f) => (f.check ? [{ ...f.check, message: `${f.label}: ${f.check.message}` }] : []))];
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
      content: [meta.map((id) => csvCell(LABELS[id])).join(","), meta.map((id) => csvCell(get(id))).join(",")].join("\n") + "\n",
    },
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
