import type { SongMeta, SongStatus, StageLogEntry, Workspace } from "../types";

/** Entries kept per song: plenty for the Pace block, small in workspace.json. */
export const MAX_STAGE_LOG = 50;

/** The song's stage as the app shows it (no stored stage = Creation). */
const stageOf = (meta: SongMeta | undefined): SongStatus => meta?.status ?? "creation";

/** Appends one entry to every song whose stage changed between `prev` and
 * `next`, whoever changed it (drawer, board, kit, a crewmate's move pulled
 * from the crew). The time is the move's own (`stageUpdatedAtMs`, which a
 * crew pull sets to the crewmate's time), else `now`. A song that only
 * moved to a new path (a relink) is not a stage change. Returns `next`
 * itself when nothing changed. */
export function logStageChanges(prev: Workspace, next: Workspace, now: number): Workspace {
  if (prev.songs === next.songs) return next;
  // Paths that disappeared in this edit: a song appearing elsewhere is a relink.
  const relinked = Object.keys(prev.songs).some((p) => !(p in next.songs));
  let songs: Workspace["songs"] | null = null;
  for (const [path, meta] of Object.entries(next.songs)) {
    const before = prev.songs[path];
    if (before === meta) continue;
    if (!before && relinked) continue;
    const stage = stageOf(meta);
    if (stage === stageOf(before)) continue;
    const log = meta.stageLog ?? [];
    if (log.length && log[log.length - 1].stage === stage) continue;
    const at = meta.stageUpdatedAtMs && meta.stageUpdatedAtMs !== before?.stageUpdatedAtMs ? meta.stageUpdatedAtMs : now;
    const entry: StageLogEntry = { stage, atMs: at };
    songs ??= { ...next.songs };
    songs[path] = { ...meta, stageLog: [...log, entry].slice(-MAX_STAGE_LOG) };
  }
  return songs ? { ...next, songs } : next;
}
