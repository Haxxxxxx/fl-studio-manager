import type { CrewSongRow, ProjectInfo, SongMeta, SongStatus, Workspace } from "../types";
import { cleanTitle } from "./launchKit";

// Sync between the local workspace and the crew database (docs/ARCHITECTURE.md).
// Pure functions: what to push for a shared song, and which remote stage moves
// to apply locally. Only metadata ever leaves the computer.

export type SharedSongPayload = Omit<CrewSongRow, "owner_id" | "stage_updated_by" | "updated_at">;

const iso = (ms: number) => new Date(ms).toISOString();

/** The release date the crew should see: the song's release, else its Launch Kit date. */
function releaseDateFor(path: string, meta: SongMeta, ws: Workspace): string | null {
  const album = ws.albums.find((a) => a.trackPaths.includes(path) && a.releaseDate);
  const date = album?.releaseDate ?? meta.launchKit?.edits?.releaseDate ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** The row to upsert for one shared song, capped to the database's checks. */
export function sharedSongPayload(project: ProjectInfo, meta: SongMeta, ws: Workspace, crewId: string): SharedSongPayload | null {
  if (!meta.shared || !meta.shareId) return null;
  const name = (id: string) => ws.people.find((p) => p.id === id)?.name;
  const bpm = project.tempoBpm != null && project.tempoBpm >= 10 && project.tempoBpm <= 522 ? Math.round(project.tempoBpm * 100) / 100 : null;
  return {
    id: meta.shareId,
    crew_id: crewId,
    title: (cleanTitle(project.name) || project.name).slice(0, 200),
    stage: meta.status ?? null,
    bpm,
    musical_key: meta.key ? meta.key.slice(0, 8) : null,
    tags: (meta.tags ?? []).slice(0, 30),
    credits: (meta.credits ?? []).flatMap((c) => {
      const n = name(c.personId);
      return n ? [{ name: n, role: c.role, split: c.split ?? null }] : [];
    }),
    release_date: releaseDateFor(project.path, meta, ws),
    has_mixdown: project.renders.length > 0,
    kit_accepted: !!meta.launchKit?.acceptedAtMs,
    last_saved_at: iso(project.modifiedAtMs),
    stage_updated_at: iso(meta.stageUpdatedAtMs ?? project.modifiedAtMs),
  };
}

/** Every shared song's payload, for one push. */
export function sharedPayloads(projects: ProjectInfo[], ws: Workspace, crewId: string): SharedSongPayload[] {
  return projects.flatMap((p) => {
    const row = sharedSongPayload(p, ws.songs[p.path] ?? {}, ws, crewId);
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

/** My songs in the database that I've explicitly stopped sharing: these get
 * deleted on the next push. A song that's merely missing from this scan (an
 * unplugged drive, a renamed folder) stays shared: it isn't unshared. */
export function staleShareIds(rows: CrewSongRow[], ws: Workspace, myUserId: string): string[] {
  const stillShared = new Set(
    Object.values(ws.songs)
      .filter((m) => m.shared && m.shareId)
      .map((m) => m.shareId!),
  );
  return rows.filter((r) => r.owner_id === myUserId && !stillShared.has(r.id)).map((r) => r.id);
}
