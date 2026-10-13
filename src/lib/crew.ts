import type { Person, ProjectInfo, SongStatus, Workspace } from "../types";
import { songsOf } from "./people";
import { isFinished } from "./songs";

// Group-level stats for the dashboard (docs/ROADMAP.md, Phase 1a): who's
// working on what, and which tracks are stuck.

const DAY = 24 * 60 * 60 * 1000;
/** No FL save for this long while still being made = stalled. */
export const STALLED_DAYS = 21;

export interface StalledSong {
  song: ProjectInfo;
  status: SongStatus | undefined;
  idleDays: number;
}

/** Songs still being made (Creation/Production) with no save in a while, oldest first. */
export function stalledSongs(songs: ProjectInfo[], ws: Workspace, now = Date.now(), days = STALLED_DAYS): StalledSong[] {
  return songs
    .map((song) => ({ song, status: ws.songs[song.path]?.status, idleDays: Math.floor((now - song.modifiedAtMs) / DAY) }))
    .filter((s) => (s.status === "creation" || s.status === "production") && s.idleDays >= days)
    .sort((a, b) => b.idleDays - a.idleDays);
}

export interface CrewMember {
  person: Person;
  /** Songs they're credited on or found in, not archived. */
  songs: ProjectInfo[];
  /** Still being made (not Prep or later). */
  active: number;
  byStage: Partial<Record<SongStatus | "unsorted", number>>;
  /** Last FL save across their songs, or 0. */
  lastSessionMs: number;
}

/** Each person and their songs, most recently active first. */
export function crewActivity(people: Person[], songs: ProjectInfo[], ws: Workspace): CrewMember[] {
  return people
    .map((person) => {
      const theirs = songsOf(person, songs, ws).map((x) => x.song);
      const byStage: CrewMember["byStage"] = {};
      for (const s of theirs) {
        const st = ws.songs[s.path]?.status ?? "unsorted";
        byStage[st] = (byStage[st] ?? 0) + 1;
      }
      return {
        person,
        songs: theirs,
        active: theirs.filter((s) => !isFinished(ws.songs[s.path]?.status)).length,
        byStage,
        lastSessionMs: Math.max(0, ...theirs.map((s) => s.modifiedAtMs)),
      };
    })
    .sort((a, b) => b.lastSessionMs - a.lastSessionMs);
}
