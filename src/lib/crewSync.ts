import type { CrewSongRow, ProjectInfo, SongMeta, SongStatus, Workspace } from "../types";
import { cleanTitle } from "./launchKit";

// Sync between the local workspace and the crew database (docs/ARCHITECTURE.md).
// Pure functions: what to push for a shared song, which remote stage moves to
// apply locally, which local moves to send, and what to delete. Only metadata
// ever leaves the computer.
//
// Rules that keep a crewmate's data safe:
// - A share belongs to one crew and one account (`ShareScope`). Other crews
//   and other sign-ins on this machine never push or delete it.
// - A row is deleted only when this workspace explicitly unshared it
//   (`shared: false` with its shareId kept). A song missing from a scan, from
//   another computer's workspace, or from an empty workspace is never deleted.
// - The stage is never sent in the regular upsert (that could rewind a move
//   a crewmate made on the board). New rows carry it; later local moves go
//   through set_song_stage, only when the local move is newer.

export interface ShareScope {
  crewId: string;
  userId: string;
}

/** What gets upserted. `stage` is only used for brand-new rows. */
export type SharedSongPayload = Omit<CrewSongRow, "owner_id" | "stage_updated_by" | "stage_updated_at" | "updated_at">;

const iso = (ms: number) => new Date(ms).toISOString();

/** Shared with this crew by this account (legacy unscoped shares count too). */
export function sharedHere(meta: SongMeta | undefined, scope: ShareScope): boolean {
  return !!meta?.shared && !!meta.shareId && inScope(meta, scope);
}

function inScope(meta: SongMeta, scope: ShareScope): boolean {
  return (meta.shareCrewId ?? scope.crewId) === scope.crewId && (meta.shareUserId ?? scope.userId) === scope.userId;
}

/** The release date the crew should see: the song's release, else its Launch Kit date. */
function releaseDateFor(path: string, meta: SongMeta, ws: Workspace): string | null {
  const album = ws.albums.find((a) => a.trackPaths.includes(path) && a.releaseDate);
  const date = album?.releaseDate ?? meta.launchKit?.edits?.releaseDate ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** The row to upsert for one shared song, capped to the database's checks. */
export function sharedSongPayload(project: ProjectInfo, meta: SongMeta, ws: Workspace, scope: ShareScope): SharedSongPayload | null {
  if (!sharedHere(meta, scope)) return null;
  const name = (id: string) => ws.people.find((p) => p.id === id)?.name;
  const bpm = project.tempoBpm != null && project.tempoBpm >= 10 && project.tempoBpm <= 522 ? Math.round(project.tempoBpm * 100) / 100 : null;
  return {
    id: meta.shareId!,
    crew_id: scope.crewId,
    title: (cleanTitle(project.name) || project.name).slice(0, 200),
    stage: meta.status ?? null,
    bpm,
    musical_key: meta.key ? meta.key.slice(0, 8) : null,
    tags: (meta.tags ?? []).slice(0, 30).map((t) => t.slice(0, 40)),
    credits: (meta.credits ?? [])
      .flatMap((c) => {
        const n = name(c.personId);
        return n ? [{ name: n.slice(0, 60), role: c.role, split: c.split ?? null }] : [];
      })
      .slice(0, 30),
    release_date: releaseDateFor(project.path, meta, ws),
    has_mixdown: project.renders.length > 0,
    kit_accepted: !!meta.launchKit?.acceptedAtMs,
    last_saved_at: iso(project.modifiedAtMs),
  };
}

/** Every shared song's payload, for one push. */
export function sharedPayloads(projects: ProjectInfo[], ws: Workspace, scope: ShareScope): SharedSongPayload[] {
  return projects.flatMap((p) => {
    const row = sharedSongPayload(p, ws.songs[p.path] ?? {}, ws, scope);
    return row ? [row] : [];
  });
}

/** shareId → local .flp path. */
export function pathsByShareId(ws: Workspace): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, meta] of Object.entries(ws.songs)) if (meta.shareId) out.set(meta.shareId, path);
  return out;
}

export interface RemoteStageMove {
  path: string;
  stage: SongStatus | undefined;
  atMs: number;
}

/** Stage moves made on the crew board for *my* songs that are newer than my
 * last local change: these get applied to the local workspace. */
export function remoteStageMoves(rows: CrewSongRow[], ws: Workspace, myUserId: string): RemoteStageMove[] {
  const byId = pathsByShareId(ws);
  const out: RemoteStageMove[] = [];
  for (const row of rows) {
    if (row.owner_id !== myUserId) continue;
    const path = byId.get(row.id);
    if (!path) continue;
    const meta = ws.songs[path] ?? {};
    const remote = row.stage ?? undefined;
    const atMs = Date.parse(row.stage_updated_at);
    if (remote !== meta.status && Number.isFinite(atMs) && atMs > (meta.stageUpdatedAtMs ?? 0)) {
      out.push({ path, stage: remote, atMs });
    }
  }
  return out;
}

/** Local stage moves on my shared songs that the crew hasn't seen yet (local
 * move newer than the row's). Run after applying remote moves. */
export function localStageMoves(rows: CrewSongRow[], ws: Workspace, scope: ShareScope): { id: string; stage: SongStatus | null }[] {
  const byId = pathsByShareId(ws);
  const out: { id: string; stage: SongStatus | null }[] = [];
  for (const row of rows) {
    if (row.owner_id !== scope.userId || row.crew_id !== scope.crewId) continue;
    const path = byId.get(row.id);
    const meta = path ? ws.songs[path] : undefined;
    if (!meta || !sharedHere(meta, scope)) continue;
    const local = meta.status ?? null;
    if (local !== (row.stage ?? null) && (meta.stageUpdatedAtMs ?? 0) > (Date.parse(row.stage_updated_at) || 0)) {
      out.push({ id: row.id, stage: local });
    }
  }
  return out;
}

/** My rows in this crew that this workspace explicitly stopped sharing:
 * these get deleted. A row with no local record (another computer, a fresh
 * workspace, an unplugged drive) is left alone. */
export function staleShareIds(rows: CrewSongRow[], ws: Workspace, scope: ShareScope): string[] {
  const unshared = new Set(
    Object.values(ws.songs)
      .filter((m) => m.shared === false && m.shareId && inScope(m, scope))
      .map((m) => m.shareId!),
  );
  return rows.filter((r) => r.owner_id === scope.userId && r.crew_id === scope.crewId && unshared.has(r.id)).map((r) => r.id);
}

/** Paths of songs shared here that aren't in the library right now (renamed,
 * moved, deleted, or on an unplugged drive). Their crew cards are frozen. */
export function orphanedShares(projects: ProjectInfo[], ws: Workspace, scope: ShareScope): string[] {
  const present = new Set(projects.map((p) => p.path));
  return Object.entries(ws.songs)
    .filter(([path, m]) => sharedHere(m, scope) && !present.has(path))
    .map(([path]) => path);
}
