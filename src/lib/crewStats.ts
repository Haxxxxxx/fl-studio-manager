import type { CrewMemberRow, CrewSongRow, SongStatus } from "../types";
import { STALLED_DAYS } from "./crew";
import { isFinished } from "./songs";

// Roadmap 1a: "stats that matter to the group vs only to me". Group stats are
// built only from what members chose to share (crew songs), never from local
// files: pipeline, who's moving what, what's stuck, what's coming out.
// Personal stats (studio activity, plugins, storage, health) stay on "Me".

const DAY = 24 * 60 * 60 * 1000;
export const RECENT_DAYS = 7;

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
/** Latest sign of life: a save in FL or a stage move. */
export const lastActivityMs = (s: CrewSongRow) => Math.max(ms(s.last_saved_at), ms(s.stage_updated_at));

export interface CrewMemberStats {
  userId: string;
  name: string;
  songs: number;
  finished: number;
  /** Songs this member last moved within RECENT_DAYS (latest move only is stored). */
  recentMoves: number;
  lastActivityMs: number;
}

export interface CrewStats {
  total: number;
  byStage: { id: SongStatus | null; count: number }[];
  inProgress: number;
  finished: number;
  /** Prep with a mixdown and an accepted Launch Kit: the next things to ship. */
  readyToShip: CrewSongRow[];
  movedRecently: number;
  stalled: { song: CrewSongRow; days: number; owner: string }[];
  upcoming: { song: CrewSongRow; owner: string; date: string }[];
  members: CrewMemberStats[];
}

const STAGES: (SongStatus | null)[] = [null, "creation", "production", "prep", "release", "promotion"];

/** `today` is a local YYYY-MM-DD (release dates are plain dates). */
export function crewStats(songs: CrewSongRow[], members: CrewMemberRow[], now = Date.now(), today = localDay(now)): CrewStats {
  const nameOf = (id: string | null | undefined) => members.find((m) => m.user_id === id)?.display_name ?? "Former member";
  const recent = now - RECENT_DAYS * DAY;

  const stalled = songs
    .filter((s) => s.stage === "creation" || s.stage === "production")
    .map((s) => ({ song: s, days: Math.floor((now - lastActivityMs(s)) / DAY), owner: nameOf(s.owner_id) }))
    .filter((x) => x.days >= STALLED_DAYS)
    .sort((a, b) => b.days - a.days);

  const upcoming = songs
    .filter((s) => s.release_date && s.release_date >= today)
    .map((s) => ({ song: s, owner: nameOf(s.owner_id), date: s.release_date! }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const memberStats: CrewMemberStats[] = members.map((m) => {
    const own = songs.filter((s) => s.owner_id === m.user_id);
    return {
      userId: m.user_id,
      name: m.display_name,
      songs: own.length,
      finished: own.filter((s) => isFinished(s.stage ?? undefined)).length,
      recentMoves: songs.filter((s) => s.stage_updated_by === m.user_id && ms(s.stage_updated_at) >= recent).length,
      lastActivityMs: own.reduce((t, s) => Math.max(t, lastActivityMs(s)), 0),
    };
  });
  memberStats.sort((a, b) => b.lastActivityMs - a.lastActivityMs || a.name.localeCompare(b.name));

  return {
    total: songs.length,
    byStage: STAGES.map((id) => ({ id, count: songs.filter((s) => (s.stage ?? null) === id).length })),
    inProgress: songs.filter((s) => s.stage === "creation" || s.stage === "production").length,
    finished: songs.filter((s) => isFinished(s.stage ?? undefined)).length,
    readyToShip: songs.filter((s) => s.stage === "prep" && s.has_mixdown && s.kit_accepted),
    movedRecently: songs.filter((s) => ms(s.stage_updated_at) >= recent && s.stage_updated_by).length,
    stalled,
    upcoming,
    members: memberStats,
  };
}

export function localDay(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
