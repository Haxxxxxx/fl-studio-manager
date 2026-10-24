import type { CrewColumnRow, CrewSongRow, PipelineColumn, PipelineConfig, SongStatus, Workspace } from "../types";
import { addColumn, canRemoveColumn, defaultPipeline, moveColumn, removeColumn, renameColumn, resolvePipeline } from "./pipeline";

// The crew board's columns and card order (desktop and website share this).
// Same rules as your own pipeline (src/lib/pipeline.ts): columns sit on the
// five stages; moving a card to a column of another stage changes the song's
// stage. The columns live on the crew server (crew_columns); only the owner
// edits them (set_crew_columns). A crew that never edited its columns shows
// one column per stage, and moves are plain stage moves.

/** The crew's columns, repaired like yours (every stage keeps a column).
 * `serverIds`: which column ids exist on the server. */
export function crewPipeline(rows: CrewColumnRow[]): { cfg: PipelineConfig; onServer: boolean } {
  if (rows.length === 0) return { cfg: defaultPipeline(), onServer: false };
  const columns = [...rows].sort((a, b) => a.position - b.position).map(({ id, name, stage }) => ({ id, name, stage }));
  return { cfg: resolvePipeline({ pipeline: { columns, order: {} } }), onServer: true };
}

/** The column a crew song is in: its column if it's one of its stage's
 * (the server clears it otherwise), else the stage's first column. */
export function crewColumnOf(song: Pick<CrewSongRow, "stage" | "column_id">, cfg: PipelineConfig): PipelineColumn {
  const stage = song.stage ?? null;
  const pinned = song.column_id ? cfg.columns.find((c) => c.id === song.column_id && c.stage === stage) : undefined;
  return pinned ?? cfg.columns.find((c) => c.stage === stage)!;
}

/** Hand-placed cards first (board_order), then the rest, most recently moved first. */
function byBoardOrder(a: CrewSongRow, b: CrewSongRow): number {
  const oa = a.board_order ?? null;
  const ob = b.board_order ?? null;
  if (oa != null && ob != null && oa !== ob) return oa - ob;
  if (oa != null && ob == null) return -1;
  if (oa == null && ob != null) return 1;
  return Date.parse(b.stage_updated_at) - Date.parse(a.stage_updated_at) || a.title.localeCompare(b.title);
}

export function groupCrewSongs(songs: CrewSongRow[], cfg: PipelineConfig): { column: PipelineColumn; songs: CrewSongRow[] }[] {
  const groups = new Map(cfg.columns.map((c) => [c.id, [] as CrewSongRow[]]));
  for (const s of songs) groups.get(crewColumnOf(s, cfg).id)!.push(s);
  return cfg.columns.map((column) => ({ column, songs: groups.get(column.id)!.sort(byBoardOrder) }));
}

/** The board_order for a card dropped in `column` before `beforeId` (or at
 * the end). Only hand-placed cards count: like your own board, cards nobody
 * placed stay after them. */
export function orderFor(columnSongs: CrewSongRow[], movingId: string, beforeId: string | null): number {
  const placed = columnSongs.filter((s) => s.id !== movingId && Number.isFinite(s.board_order ?? NaN));
  const before = beforeId ? placed.findIndex((s) => s.id === beforeId) : -1;
  if (before < 0) return placed.length ? placed[placed.length - 1].board_order! + 1 : 1;
  const next = placed[before].board_order!;
  const prev = before > 0 ? placed[before - 1].board_order! : next - 2;
  return (prev + next) / 2;
}

/** What a card move does on the server. */
export type CrewMove =
  | {
      kind: "card";
      songId: string;
      columnId: string;
      order: number;
      expectedAt: string;
      /** Other cards of the column to place by hand too, so the card lands
       * exactly where it was dropped (same stage: only their order changes). */
      renumber: { songId: string; order: number }[];
    }
  | { kind: "stage"; songId: string; stage: SongStatus | null; expectedAt: string }
  | { kind: "none" };

const placed = (s: CrewSongRow) => Number.isFinite(s.board_order ?? NaN);

/** Moving a crew song: a card move (column + order) once the crew has its
 * columns on the server, else a plain stage move. */
export function crewMove(songs: CrewSongRow[], cfg: PipelineConfig, onServer: boolean, songId: string, columnId: string, beforeId: string | null): CrewMove {
  const song = songs.find((s) => s.id === songId);
  const column = cfg.columns.find((c) => c.id === columnId);
  if (!song || !column) return { kind: "none" };
  if (!onServer) {
    return (song.stage ?? null) === column.stage ? { kind: "none" } : { kind: "stage", songId, stage: column.stage, expectedAt: song.stage_updated_at };
  }
  // Dropped on itself: nothing moves (a tiny accidental drag).
  if (beforeId === songId) {
    if (crewColumnOf(song, cfg).id === columnId) return { kind: "none" };
    beforeId = null;
  }
  const inColumn = groupCrewSongs(songs, cfg).find((g) => g.column.id === columnId)!.songs;
  const others = inColumn.filter((s) => s.id !== songId);
  let at = beforeId ? others.findIndex((s) => s.id === beforeId) : others.length;
  if (at < 0) at = others.length;
  // Dropped where it already sits: nothing changes, so no call to the server.
  if (inColumn.findIndex((s) => s.id === songId) === at) return { kind: "none" };
  const base = { kind: "card" as const, songId, columnId, expectedAt: song.stage_updated_at };
  // Every card up to the drop point is placed by hand: one order between them.
  if (others.slice(0, at === others.length ? at : at + 1).every(placed)) {
    return { ...base, order: orderFor(inColumn, songId, beforeId), renumber: [] };
  }
  // Cards nobody placed sit after placed ones, so the drop point can't be
  // expressed with one order: place the whole column as it's shown.
  const list = [...others];
  list.splice(at, 0, song);
  const renumber = list.flatMap((s, i) => (s.id !== songId && s.board_order !== i + 1 ? [{ songId: s.id, order: i + 1 }] : []));
  return { ...base, order: at + 1, renumber };
}

/** The board right after a card move (shown before the server answers). */
export function applyCardMove(songs: CrewSongRow[], move: Extract<CrewMove, { kind: "card" }>, stage: SongStatus | null): CrewSongRow[] {
  const orders = new Map(move.renumber.map((r) => [r.songId, r.order]));
  return songs.map((s) =>
    s.id === move.songId
      ? { ...s, stage, column_id: move.columnId, board_order: move.order }
      : orders.has(s.id)
        ? { ...s, column_id: move.columnId, board_order: orders.get(s.id)! }
        : s,
  );
}

/** Undo a refused move on these songs only (other updates that arrived meanwhile stay). */
export function restoreSongs(now: CrewSongRow[], before: CrewSongRow[], ids: string[]): CrewSongRow[] {
  const old = new Map(before.filter((s) => ids.includes(s.id)).map((s) => [s.id, s]));
  return now.map((s) => old.get(s.id) ?? s);
}

// ---- Owner edits: same rules as your pipeline, sent whole to set_crew_columns ----

const asWorkspace = (cfg: PipelineConfig): Workspace => ({ version: 2, songs: {}, albums: [], people: [], pipeline: cfg });
const cfgOf = (ws: Workspace) => resolvePipeline(ws);

export const crewEdits = {
  rename: (cfg: PipelineConfig, id: string, name: string) => cfgOf(renameColumn(asWorkspace(cfg), id, name)),
  add: (cfg: PipelineConfig, name: string, stage: SongStatus | null, id: string) => cfgOf(addColumn(asWorkspace(cfg), name, stage, id)),
  remove: (cfg: PipelineConfig, id: string) => cfgOf(removeColumn(asWorkspace(cfg), id)),
  move: (cfg: PipelineConfig, id: string, toIndex: number) => cfgOf(moveColumn(asWorkspace(cfg), id, toIndex)),
  canRemove: (cfg: PipelineConfig, id: string) => canRemoveColumn(cfg, id),
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The set_crew_columns payload. Default columns (never saved) get fresh ids. */
export function columnsPayload(cfg: PipelineConfig, newId: () => string): { id: string; name: string; stage: SongStatus | null }[] {
  return cfg.columns.map((c) => ({ id: UUID.test(c.id) ? c.id : newId(), name: c.name, stage: c.stage }));
}
