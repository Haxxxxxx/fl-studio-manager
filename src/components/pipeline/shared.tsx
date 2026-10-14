import { useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { usePipelineView, type PipelineViewKind } from "../../store/usePipelineView";
import { canRemoveColumn, filterSongs, groupSongs, resolvePipeline, stageColor, stageLabel, STAGE_ORDER, NAME_MAX } from "../../lib/pipeline";
import { formatRelative } from "../../lib/format";
import { albumsOf, formatBpm, lastSaveMs } from "../../lib/songs";
import type { PipelineColumn, ProjectInfo, SongStatus } from "../../types";
import { useVisibleSongs } from "../LibraryView";
import { MixdownBadge } from "../../ui";
import { ConfirmButton, StatusDot } from "../ui";

// Pieces shared by the board, list and table: the model hook, the column
// header (rename / collapse / remove / drag to reorder), the add-column form,
// the stage-conflict marker and the drag rules. One place, so the three views
// can't drift apart.

/** The pipeline model every view renders: one source of truth. */
export function usePipelineModel() {
  const songs = useVisibleSongs();
  const workspace = useAppStore((s) => s.workspace);
  const query = usePipelineView((s) => s.query);
  return useMemo(() => {
    const cfg = resolvePipeline(workspace);
    const shown = filterSongs(songs, workspace, query);
    return { songs, workspace, cfg, query, groups: groupSongs(shown, workspace, cfg) };
  }, [songs, workspace, query]);
}

// ---- Drag rules (HTML5 drag and drop; Tauri's own file drop is off) ----

const COLUMN_TYPE = "application/x-hivo-column";
/** Songs travel as text/plain (their path), like before. */
const SONG_TYPE = "text/plain";

export function dragKind(e: DragEvent): "song" | "column" | null {
  const types = Array.from(e.dataTransfer.types);
  if (types.includes(COLUMN_TYPE)) return "column";
  if (types.includes(SONG_TYPE)) return "song";
  return null;
}

export function startSongDrag(e: DragEvent, path: string) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(SONG_TYPE, path);
}

export function startColumnDrag(e: DragEvent, id: string) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(COLUMN_TYPE, id);
}

export const draggedSong = (e: DragEvent) => e.dataTransfer.getData(SONG_TYPE);
export const draggedColumn = (e: DragEvent) => e.dataTransfer.getData(COLUMN_TYPE);

/** Dropping on a card or row: before it (top half) or before the next one. */
export function beforePathFor(e: DragEvent, list: ProjectInfo[], index: number): string | null {
  const r = e.currentTarget.getBoundingClientRect();
  const upper = e.clientY < r.top + r.height / 2;
  return upper ? list[index].path : (list[index + 1]?.path ?? null);
}

/** Where a dragged song would land (for the drop line). */
export interface DropSpot {
  columnId: string;
  beforePath: string | null;
}

/** Drop handling for songs and columns, shared by the board and the list. */
export function usePipelineDrop(songs: ProjectInfo[]) {
  const movePipelineCard = useAppStore((s) => s.movePipelineCard);
  const movePipelineColumn = useAppStore((s) => s.movePipelineColumn);
  const [spot, setSpotState] = useState<DropSpot | null>(null);
  const [columnOver, setColumnOver] = useState<string | null>(null);
  // The drop reads the latest spot from a ref: state can lag a render behind
  // the last dragover, which would land the card one slot off.
  const spotRef = useRef<DropSpot | null>(null);
  const setSpot = (next: DropSpot | null) => {
    if (spotRef.current?.columnId === next?.columnId && spotRef.current?.beforePath === next?.beforePath) return;
    spotRef.current = next;
    setSpotState(next);
  };
  return {
    spot,
    columnOver,
    /** dragover on a column (or a card in it, with its before-path). */
    over(e: DragEvent, columnId: string, beforePath: string | null) {
      const kind = dragKind(e);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (kind === "song") setSpot({ columnId, beforePath });
      else setColumnOver(columnId);
    },
    leave(e: DragEvent) {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setSpot(null);
        setColumnOver(null);
      }
    },
    drop(e: DragEvent, columnId: string, columnIndex: number) {
      e.preventDefault();
      e.stopPropagation();
      const kind = dragKind(e);
      const latest = spotRef.current;
      const target = latest?.columnId === columnId ? latest.beforePath : null;
      setSpot(null);
      setColumnOver(null);
      if (kind === "column") {
        const id = draggedColumn(e);
        if (id && id !== columnId) movePipelineColumn(id, columnIndex);
        return;
      }
      // Only your songs: dragged text or links aren't songs.
      const path = draggedSong(e);
      if (songs.some((p) => p.path === path)) movePipelineCard(songs, path, columnId, target);
    },
    end() {
      setSpot(null);
      setColumnOver(null);
    },
  };
}

// ---- Column header ----

export function ColumnHeader({
  column,
  count,
  view,
  collapsed,
  className = "",
}: {
  column: PipelineColumn;
  count: number;
  view: PipelineViewKind;
  collapsed: boolean;
  className?: string;
}) {
  const workspace = useAppStore((s) => s.workspace);
  const rename = useAppStore((s) => s.renamePipelineColumn);
  const remove = useAppStore((s) => s.removePipelineColumn);
  const openNewProject = useAppStore((s) => s.openNewProject);
  const toggleCollapsed = usePipelineView((s) => s.toggleCollapsed);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const startEditing = () => {
    cancelled.current = false;
    setEditing(true);
  };
  const move = useAppStore((s) => s.movePipelineColumn);
  const index = resolvePipeline(workspace).columns.findIndex((c) => c.id === column.id);
  const total = resolvePipeline(workspace).columns.length;
  const removable = canRemoveColumn(resolvePipeline(workspace), column.id);
  const renamed = column.name.toLowerCase() !== stageLabel(column.stage).toLowerCase();

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => startColumnDrag(e, column.id)}
      title={editing ? undefined : "Drag to reorder columns"}
      className={`group/col relative min-w-0 cursor-grab active:cursor-grabbing ${className}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          onClick={() => toggleCollapsed(view, column.id)}
          aria-label={collapsed ? `Expand ${column.name}` : `Collapse ${column.name}`}
          aria-expanded={!collapsed}
          className="shrink-0 rounded text-engrave hover:text-cream"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
        <StatusDot color={stageColor(column.stage)} />
        {editing ? (
          <input
            autoFocus
            defaultValue={column.name}
            maxLength={NAME_MAX}
            aria-label="Column name"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                cancelled.current = true;
                setEditing(false);
              }
            }}
            onBlur={(e) => {
              if (!cancelled.current) rename(column.id, e.currentTarget.value);
              cancelled.current = false;
              setEditing(false);
            }}
            className="min-w-0 flex-1 rounded border border-hot bg-chassis px-1 py-0 text-xs font-medium text-cream focus:outline-none"
          />
        ) : (
          <button
            onDoubleClick={startEditing}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "F2") && (e.preventDefault(), startEditing())}
            title="Double-click (or Enter) to rename"
            className="min-w-0 truncate text-left text-xs font-medium text-cream"
          >
            {column.name}
          </button>
        )}
        <span className="shrink-0 text-xs text-engrave">{count}</span>
      </div>
      {renamed && !editing && (
        <div className="mt-0.5 pl-[34px] font-mono text-[9.5px] uppercase tracking-wider text-engrave" title="The stage the crew sees">
          {stageLabel(column.stage)}
        </div>
      )}
      {/* Actions float over the header on hover/focus, so they never squeeze the name. */}
      {!editing && (
        <span className="absolute right-0 top-0 flex items-center gap-0.5 rounded bg-panel pl-1 opacity-0 focus-within:opacity-100 group-hover/col:opacity-100">
          {column.stage === "creation" && (
            <button onClick={() => openNewProject({ status: "creation" })} title="New song" aria-label="New song" className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream">
              <Plus size={13} />
            </button>
          )}
          <button onClick={() => move(column.id, index - 1)} disabled={index <= 0} title="Move left" aria-label={`Move ${column.name} earlier`} className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream disabled:opacity-30">
            <ArrowLeft size={12} />
          </button>
          <button onClick={() => move(column.id, index + 1)} disabled={index >= total - 1} title="Move right" aria-label={`Move ${column.name} later`} className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream disabled:opacity-30">
            <ArrowRight size={12} />
          </button>
          <button onClick={startEditing} title="Rename" aria-label={`Rename ${column.name}`} className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream">
            <Pencil size={12} />
          </button>
          <span title={removable ? `Remove (songs move to the other ${stageLabel(column.stage)} column)` : `Every stage keeps one column. Rename it, or collapse it.`}>
            <ConfirmButton
              disabled={!removable}
              label={<Trash2 size={12} aria-label={`Remove ${column.name}`} />}
              confirmLabel="Remove?"
              onConfirm={() => remove(column.id)}
              className="rounded border border-transparent p-0.5 text-[10px] text-engrave hover:bg-rule hover:text-cream disabled:opacity-30"
            />
          </span>
        </span>
      )}
    </div>
  );
}

// ---- Add a column ----

export function AddColumn({ compact = false }: { compact?: boolean }) {
  const add = useAppStore((s) => s.addPipelineColumn);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<SongStatus | null>("production");
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-lg border border-dashed border-rule px-3 py-2 text-xs text-engrave hover:border-rule-strong hover:text-cream ${compact ? "" : "h-fit min-w-[150px]"}`}
      >
        <Plus size={13} /> Add a column
      </button>
    );
  }
  const submit = () => {
    if (!name.trim()) return;
    add(name, stage);
    setName("");
    setOpen(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`flex h-fit flex-col gap-2 rounded-lg border border-rule bg-panel p-3 ${compact ? "max-w-sm" : "min-w-[190px]"}`}
    >
      <input
        autoFocus
        value={name}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Column name (e.g. Mixing)"
        aria-label="New column name"
        className="rounded border border-rule-strong bg-chassis px-2 py-1.5 text-xs text-cream placeholder:text-engrave focus:border-hot focus:outline-none"
      />
      <label className="flex flex-col gap-1 text-[11px] text-engrave">
        Stage (what the crew sees)
        <select
          value={stage ?? ""}
          onChange={(e) => setStage((e.target.value || null) as SongStatus | null)}
          className="rounded border border-rule-strong bg-chassis px-2 py-1.5 text-xs text-cream"
        >
          {STAGE_ORDER.map((s) => (
            <option key={s ?? "unsorted"} value={s ?? ""}>
              {stageLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim()} className="rounded bg-hot px-2.5 py-1 text-xs font-semibold text-chassis disabled:opacity-50">
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-xs text-engrave hover:text-cream">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---- Song bits ----

export function ConflictDot({ path }: { path: string }) {
  const conflict = useAppStore((s) => !!s.workspace.songs[path]?.stageConflict);
  if (!conflict) return null;
  return (
    <span
      title="A crewmate moved this song on the crew board too: open it to choose"
      aria-label="Stage conflict"
      className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
    />
  );
}

export function SongCard({ song, selected, onOpen }: { song: ProjectInfo; selected: boolean; onOpen: () => void }) {
  const workspace = useAppStore((s) => s.workspace);
  const albums = albumsOf(workspace, song.path);
  const tags = workspace.songs[song.path]?.tags ?? [];
  return (
    <div
      draggable
      onDragStart={(e) => startSongDrag(e, song.path)}
      onClick={onOpen}
      className={`cursor-grab rounded-md border px-3 py-2 active:cursor-grabbing ${
        selected ? "border-orange-400/40 bg-raised" : "border-rule bg-raised hover:border-rule-strong"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-cream">{song.name}</span>
        <ConflictDot path={song.path} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-engrave">
        <span>{formatRelative(lastSaveMs(song))}</span>
        {song.tempoBpm && <span>· {formatBpm(song.tempoBpm)} BPM</span>}
      </div>
      {(albums.length > 0 || tags.length > 0 || song.renders.length > 0) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {albums.map((a) => (
            <span key={a.id} title={a.title} className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />
          ))}
          <span className="min-w-0 flex-1 truncate text-[11px] text-engrave">{tags.map((t) => `#${t}`).join(" ")}</span>
          {song.renders.length > 0 && <MixdownBadge project={song} compact />}
        </div>
      )}
    </div>
  );
}

/** The orange line where a dragged song will land. */
export function DropLine() {
  return <div className="h-0.5 rounded-full bg-hot" aria-hidden />;
}
