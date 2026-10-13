import type { CrewCredit, CrewSongRow, ProjectInfo, SongMeta, SongStatus, Workspace } from "../types";
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
  return date && isRealDate(date) ? date : null;
}

/** YYYY-MM-DD that is an actual calendar day (Postgres refuses 2026-02-30). */
function isRealDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

// Size caps from the songs table's CHECK constraints. One row that fails them
// fails the whole push, so the payload is cut to fit, with headroom.
const TITLE_MAX = 200;
const TAGS_MAX = 30;
const TAG_CHARS = 40;
/** The database allows pg_column_size(tags) <= 2048. */
const TAGS_BYTES = 1800;
const CREDITS_MAX = 30;
const NAME_CHARS = 60;
const ROLE_CHARS = 40;
/** The database allows pg_column_size(credits) <= 8192. */
const CREDITS_BYTES = 7000;

const encoder = new TextEncoder();
const utf8 = (s: string) => encoder.encode(s).length;
/** Cut to `n` characters (code points, as Postgres counts them), never mid-emoji. */
const chars = (s: string, n: number) => Array.from(s).slice(0, n).join("");
/** Upper bound of one text element in a Postgres array (4-byte header, 4-byte aligned). */
const tagCost = (t: string) => 4 + Math.ceil(utf8(t) / 4) * 4;
/** Upper bound of one { name, role, split } object in jsonb (headers, keys, numeric). */
const creditCost = (c: { name: string; role: string }) => 64 + utf8(c.name) + utf8(c.role);

/** A title that passes btrim(title) between 1 and 200. */
export function sharedTitle(projectName: string): string {
  const t = chars((cleanTitle(projectName) || projectName).trim(), TITLE_MAX).trim();
  return t || "Untitled";
}

/** Tags cut to the database's count, length and byte caps. */
export function sharedTags(tags: string[]): string[] {
  const out: string[] = [];
  let bytes = 24; // array header
  for (const raw of tags) {
    const t = chars(raw.trim(), TAG_CHARS);
    if (!t) continue;
    if (out.length >= TAGS_MAX || bytes + tagCost(t) > TAGS_BYTES) break;
    bytes += tagCost(t);
    out.push(t);
  }
  return out;
}

/** Credits cut to the database's count, length and byte caps. */
export function sharedCredits(credits: CrewCredit[]): CrewCredit[] {
  const out: CrewCredit[] = [];
  let bytes = 16; // jsonb array header
  for (const c of credits) {
    const credit = {
      name: chars(c.name.trim(), NAME_CHARS),
      role: chars((c.role ?? "").trim(), ROLE_CHARS),
      split: typeof c.split === "number" && Number.isFinite(c.split) ? c.split : null,
    };
    if (!credit.name) continue;
    if (out.length >= CREDITS_MAX || bytes + creditCost(credit) > CREDITS_BYTES) break;
    bytes += creditCost(credit);
    out.push(credit);
  }
  return out;
}

/** The row to upsert for one shared song, always within the database's checks. */
export function sharedSongPayload(project: ProjectInfo, meta: SongMeta, ws: Workspace, scope: ShareScope): SharedSongPayload | null {
  if (!sharedHere(meta, scope)) return null;
  const name = (id: string) => ws.people.find((p) => p.id === id)?.name;
  const bpm = project.tempoBpm != null && project.tempoBpm >= 10 && project.tempoBpm <= 522 ? Math.round(project.tempoBpm * 100) / 100 : null;
  const key = meta.key ? chars(meta.key.trim(), 8) : "";
  return {
    id: meta.shareId!,
    crew_id: scope.crewId,
    title: sharedTitle(project.name),
    stage: meta.status ?? null,
    bpm,
    musical_key: key || null,
    tags: sharedTags(meta.tags ?? []),
    credits: sharedCredits(
      (meta.credits ?? []).flatMap((c) => {
        const n = name(c.personId);
        return n ? [{ name: n, role: c.role, split: c.split ?? null }] : [];
      }),
    ),
    release_date: releaseDateFor(project.path, meta, ws),
    has_mixdown: project.renders.length > 0,
    kit_accepted: !!meta.launchKit?.acceptedAtMs,
    last_saved_at: Number.isFinite(project.modifiedAtMs) ? iso(project.modifiedAtMs) : null,
  };
}

/** Where a song is shared (or waiting to be unshared) other than `scope`, if
 * anywhere. Sharing it here would replace its shareId and strand that row, so
 * it has to be moved explicitly (see useCrewStore.moveShares). */
export function shareElsewhere(meta: SongMeta | undefined, scope: ShareScope): { crewId: string; mine: boolean; shared: boolean } | null {
  if (!meta?.shareId || inScope(meta, scope)) return null;
  // Out of scope means another crew, another account, or both.
  return { crewId: meta.shareCrewId ?? scope.crewId, mine: (meta.shareUserId ?? scope.userId) === scope.userId, shared: !!meta.shared };
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
