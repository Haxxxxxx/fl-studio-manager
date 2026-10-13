import type { Album, AlbumKind, ProjectInfo, Workspace } from "../types";
import { parseDate } from "./launchKit";
import { isFinished } from "./songs";

// The release calendar (docs/ROADMAP.md, Phase 1a): every dated release,
// planned and past, with how ready it is. Sources: releases (albums, EPs,
// singles) with a date, and songs whose Launch Kit has a release date and
// aren't already on a dated release.

const DAY = 24 * 60 * 60 * 1000;

export interface CalendarCheck {
  level: "warn" | "info";
  message: string;
}

export interface CalendarEntry {
  key: string;
  date: string;
  /** Local midnight of `date`. */
  dateMs: number;
  /** Whole days from today (negative = past). */
  daysAway: number;
  title: string;
  kind: AlbumKind;
  color: string;
  /** A release (open it in Releases) or a lone song (open its Launch Kit). */
  source: { type: "album"; id: string } | { type: "song"; path: string };
  tracks: ProjectInfo[];
  /** Tracklist entries whose .flp wasn't found (moved or renamed). */
  missingTracks: number;
  finished: number;
  kitsAccepted: number;
  checks: CalendarCheck[];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function checksFor(e: Omit<CalendarEntry, "checks">, ws: Workspace): CalendarCheck[] {
  const out: CalendarCheck[] = [];
  const d = new Date(e.dateMs);
  const total = e.tracks.length;
  if (e.daysAway >= 0 && d.getDay() !== 5) out.push({ level: "info", message: "Not a Friday: new music drops worldwide on Fridays" });
  if (e.daysAway >= 0 && e.daysAway < 7 && e.finished < total) {
    out.push({ level: "warn", message: `${total - e.finished} track${total - e.finished === 1 ? "" : "s"} not finished, and it's under a week away` });
  } else if (e.daysAway >= 7 && e.daysAway < 28 && e.finished < total) {
    out.push({ level: "info", message: `${total - e.finished} track${total - e.finished === 1 ? "" : "s"} still in Creation/Production` });
  }
  if (e.daysAway >= 0 && e.daysAway < 14 && e.kitsAccepted < total) {
    out.push({ level: "warn", message: `Launch Kit not accepted for ${total - e.kitsAccepted} track${total - e.kitsAccepted === 1 ? "" : "s"}` });
  }
  const stuckInPrep = e.tracks.filter((t) => ws.songs[t.path]?.status === "prep").length;
  if (e.daysAway < 0 && stuckInPrep) {
    out.push({ level: "info", message: `Released, but ${stuckInPrep} track${stuckInPrep === 1 ? " is" : "s are"} still in Prep: move to Release or Promotion` });
  }
  if (e.missingTracks) out.push({ level: "warn", message: `${e.missingTracks} track${e.missingTracks === 1 ? "" : "s"} not found (moved or renamed)` });
  return out;
}

/** Every dated release, soonest first. */
export function buildCalendar(projects: ProjectInfo[], ws: Workspace, today = new Date()): CalendarEntry[] {
  const byPath = new Map(projects.map((p) => [p.path, p]));
  const todayMs = startOfDay(today);
  const entries: CalendarEntry[] = [];
  const onDatedRelease = new Set<string>();

  const make = (base: Pick<CalendarEntry, "key" | "date" | "title" | "kind" | "color" | "source">, paths: string[]): CalendarEntry | null => {
    const d = parseDate(base.date);
    if (!d) return null;
    const tracks = paths.map((p) => byPath.get(p)).filter((p): p is ProjectInfo => !!p);
    const e = {
      ...base,
      dateMs: d.getTime(),
      daysAway: Math.round((d.getTime() - todayMs) / DAY),
      tracks,
      missingTracks: paths.length - tracks.length,
      finished: tracks.filter((t) => isFinished(ws.songs[t.path]?.status)).length,
      kitsAccepted: tracks.filter((t) => ws.songs[t.path]?.launchKit?.acceptedAtMs).length,
    };
    return { ...e, checks: checksFor(e, ws) };
  };

  for (const a of ws.albums as Album[]) {
    if (!a.releaseDate) continue;
    a.trackPaths.forEach((p) => onDatedRelease.add(p));
    const e = make({ key: `album:${a.id}`, date: a.releaseDate, title: a.title, kind: a.kind, color: a.color, source: { type: "album", id: a.id } }, a.trackPaths);
    if (e) entries.push(e);
  }
  for (const [path, meta] of Object.entries(ws.songs)) {
    const date = meta.launchKit?.edits?.releaseDate;
    if (!date || onDatedRelease.has(path) || meta.archived) continue;
    const song = byPath.get(path);
    if (!song) continue;
    const e = make({ key: `song:${path}`, date, title: song.name, kind: "single", color: "#e8743b", source: { type: "song", path } }, [path]);
    if (e) entries.push(e);
  }
  return entries.sort((a, b) => a.dateMs - b.dateMs);
}

/** "December 2026" group label. */
export function monthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
