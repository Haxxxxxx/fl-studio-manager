import type { Album, AlbumKind, ProjectInfo, Workspace } from "../types";
import { dict, locale, tr } from "../i18n";
import { parseDate } from "./launchKit";
import { isFinished, renderFreshness } from "./songs";

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

const s = (n: number) => (n === 1 ? "" : "s");

const T = dict(
  {
    notFriday: "Not a Friday: new music drops worldwide on Fridays",
    notFinishedSoon: (n: number) => `${n} track${s(n)} not finished, and it's under a week away`,
    stillInProgress: (n: number) => `${n} track${s(n)} still in Creation/Production`,
    kitNotAccepted: (n: number) => `Launch Kit not accepted for ${n} track${s(n)}`,
    stuckInPrep: (n: number) => `Released, but ${n} track${n === 1 ? " is" : "s are"} still in Prep: move to Release or Promotion`,
    notFound: (n: number) => `${n} track${s(n)} not found (moved or renamed)`,
    mixdownNotReady: (n: number) => `${n} track${s(n)}: mixdown outdated or missing (render before you export the kit)`,
    otherKitDate: (n: number) => `${n} track${s(n)} ${n === 1 ? "has" : "have"} another date in ${n === 1 ? "its" : "their"} Launch Kit: the release's date is the one used`,
  },
  {
    notFriday: "Pas un vendredi : les nouveaux sons sortent partout le vendredi",
    notFinishedSoon: (n: number) => `${n} morceau${n === 1 ? " pas fini" : "x pas finis"}, et c'est dans moins d'une semaine`,
    stillInProgress: (n: number) => `${n} morceau${n === 1 ? "" : "x"} encore en Création/Production`,
    kitNotAccepted: (n: number) => `Launch Kit pas validé pour ${n} morceau${n === 1 ? "" : "x"}`,
    stuckInPrep: (n: number) =>
      `Sorti, mais ${n} morceau${n === 1 ? " est" : "x sont"} encore en Prépa : passe-${n === 1 ? "le" : "les"} en Sortie ou Promo`,
    notFound: (n: number) => `${n} morceau${n === 1 ? " introuvable" : "x introuvables"} (déplacé${s(n)} ou renommé${s(n)})`,
    mixdownNotReady: (n: number) => `${n} morceau${n === 1 ? "" : "x"} : mixdown pas à jour ou absent (fais le rendu avant d'exporter le kit)`,
    otherKitDate: (n: number) => `${n} morceau${n === 1 ? " a" : "x ont"} une autre date dans ${n === 1 ? "son" : "leur"} Launch Kit : c'est la date de la sortie qui compte`,
  },
);

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** `releaseDate`: the album's date, for a dated release (its tracks' own kit dates are ignored). */
function checksFor(e: Omit<CalendarEntry, "checks">, ws: Workspace, releaseDate?: string): CalendarCheck[] {
  const out: CalendarCheck[] = [];
  const d = new Date(e.dateMs);
  const total = e.tracks.length;
  const t = tr(T);
  if (e.daysAway >= 0 && d.getDay() !== 5) out.push({ level: "info", message: t.notFriday });
  if (e.daysAway >= 0 && e.daysAway < 7 && e.finished < total) {
    out.push({ level: "warn", message: t.notFinishedSoon(total - e.finished) });
  } else if (e.daysAway >= 7 && e.daysAway < 28 && e.finished < total) {
    out.push({ level: "info", message: t.stillInProgress(total - e.finished) });
  }
  if (e.daysAway >= 0 && e.daysAway < 14 && e.kitsAccepted < total) {
    out.push({ level: "warn", message: t.kitNotAccepted(total - e.kitsAccepted) });
  }
  const stuckInPrep = e.tracks.filter((track) => ws.songs[track.path]?.status === "prep").length;
  if (e.daysAway < 0 && stuckInPrep) {
    out.push({ level: "info", message: t.stuckInPrep(stuckInPrep) });
  }
  // Readiness also needs a mixdown made after the last save (the kit's master and snippets).
  const notRendered = e.tracks.filter((track) => renderFreshness(track) !== "fresh").length;
  if (e.daysAway >= 0 && notRendered) out.push({ level: e.daysAway < 14 ? "warn" : "info", message: t.mixdownNotReady(notRendered) });
  if (releaseDate) {
    const other = e.tracks.filter((track) => {
      const own = ws.songs[track.path]?.launchKit?.edits?.releaseDate;
      return !!own && own !== releaseDate;
    }).length;
    if (other) out.push({ level: "info", message: t.otherKitDate(other) });
  }
  if (e.missingTracks) out.push({ level: "warn", message: t.notFound(e.missingTracks) });
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
    return { ...e, checks: checksFor(e, ws, base.source.type === "album" ? base.date : undefined) };
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

/** Songs in Release or Promotion with no date anywhere (not on a dated
 * release, no kit date): the Calendar can't show them, so it says how many. */
export function undatedReleased(projects: ProjectInfo[], ws: Workspace): number {
  const dated = new Set((ws.albums as Album[]).filter((a) => a.releaseDate).flatMap((a) => a.trackPaths));
  return projects.filter((p) => {
    const meta = ws.songs[p.path];
    return !p.isTemplate && !meta?.archived && (meta?.status === "release" || meta?.status === "promotion") && !dated.has(p.path) && !meta?.launchKit?.edits?.releaseDate;
  }).length;
}

/** "December 2026" group label. */
export function monthLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(locale(), { month: "long", year: "numeric" });
}
