import { createContext, useContext, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { usePipelineView, type PipelineScope, type PipelineViewKind } from "../../store/usePipelineView";
import { stageColor, stageLabel, STAGE_ORDER, NAME_MAX } from "../../lib/pipeline";
import type { PipelineColumn, SongStatus } from "../../types";
import { ConfirmButton, StatusDot } from "../ui";

// Pieces shared by the board, list and table, for any pipeline: yours
// (src/components/pipeline/mine.tsx) or the crew's (crew.tsx). A pipeline is
// a `PipelineSource`: its columns with their items, and what you may do.
// One place, so the views (and the two pipelines) can't drift apart.

/** One song on a pipeline, whatever it is underneath. */
export interface PipelineItem {
  /** Your song's .flp path, or the crew song's id. */
  key: string;
  title: string;
  /** Last save, ms (0 = unknown). */
  savedMs: number;
  bpm: number | null;
  musicalKey: string;
  tags: string[];
  /** A crewmate moved it while your move was waiting. */
  conflict?: boolean;
  /** The board card's body (under the title). */
  card: ReactNode;
  /** The list row's last cell (mixdown badge, who). */
  extra?: ReactNode;
  open?: () => void;
  selected?: boolean;
}

export interface PipelineGroup {
  column: PipelineColumn;
  items: PipelineItem[];
}

export interface PipelineSource {
  scope: PipelineScope;
  groups: PipelineGroup[];
  query: string;
  /** Columns can be renamed, added, removed, reordered here. */
  editable: boolean;
  canRemove: (columnId: string) => boolean;
  rename: (columnId: string, name: string) => void;
  add: (name: string, stage: SongStatus | null) => void;
  remove: (columnId: string) => void;
  moveColumn: (columnId: string, toIndex: number) => void;
  /** Put a song in a column, before another (or at the end). */
  moveCard: (key: string, columnId: string, beforeKey: string | null) => void;
  /** "New song" on the Creation column (your pipeline only). */
  newSong?: () => void;
  /** Shown above the views (a refused move, a failed save). */
  error?: string | null;
}

const SourceContext = createContext<PipelineSource | null>(null);
export const PipelineSourceProvider = SourceContext.Provider;
export function useSource(): PipelineSource {
  const s = useContext(SourceContext);
  if (!s) throw new Error("pipeline views need a PipelineSourceProvider");
  return s;
}

// ---- Drag rules (HTML5 drag and drop; Tauri's own file drop is off) ----

const COLUMN_TYPE = "application/x-hivo-column";
/** Songs travel as text/plain (their key). */
const SONG_TYPE = "text/plain";

export function dragKind(e: DragEvent): "song" | "column" | null {
  const types = Array.from(e.dataTransfer.types);
  if (types.includes(COLUMN_TYPE)) return "column";
  if (types.includes(SONG_TYPE)) return "song";
  return null;
}

export function startSongDrag(e: DragEvent, key: string) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(SONG_TYPE, key);
}

export function startColumnDrag(e: DragEvent, id: string) {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData(COLUMN_TYPE, id);
}

/** Dropping on a card or row: before it (top half) or before the next one. */
export function beforeKeyFor(e: DragEvent, list: PipelineItem[], index: number): string | null {
  const r = e.currentTarget.getBoundingClientRect();
  const upper = e.clientY < r.top + r.height / 2;
  return upper ? list[index].key : (list[index + 1]?.key ?? null);
}

/** Where a dragged song would land (for the drop line). */
export interface DropSpot {
  columnId: string;
  beforeKey: string | null;
}

/** Drop handling for songs and columns, shared by the board and the list. */
export function usePipelineDrop() {
  const source = useSource();
  const [spot, setSpotState] = useState<DropSpot | null>(null);
  const [columnOver, setColumnOver] = useState<string | null>(null);
  // The drop reads the latest spot from a ref: state can lag a render behind
  // the last dragover, which would land the card one slot off.
  const spotRef = useRef<DropSpot | null>(null);
  const setSpot = (next: DropSpot | null) => {
    if (spotRef.current?.columnId === next?.columnId && spotRef.current?.beforeKey === next?.beforeKey) return;
    spotRef.current = next;
    setSpotState(next);
  };
  return {
    spot,
    columnOver,
    /** dragover on a column (or a card in it, with its before-key). */
    over(e: DragEvent, columnId: string, beforeKey: string | null) {
      const kind = dragKind(e);
      if (!kind || (kind === "column" && !source.editable)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (kind === "song") setSpot({ columnId, beforeKey });
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
      const target = latest?.columnId === columnId ? latest.beforeKey : null;
      setSpot(null);
      setColumnOver(null);
      if (kind === "column") {
        const id = e.dataTransfer.getData(COLUMN_TYPE);
        if (source.editable && id && id !== columnId) source.moveColumn(id, columnIndex);
        return;
      }
      // Only songs of this pipeline: dragged text or links aren't songs.
      const key = e.dataTransfer.getData(SONG_TYPE);
      if (source.groups.some((g) => g.items.some((i) => i.key === key))) source.moveCard(key, columnId, target);
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
  const source = useSource();
  const toggleCollapsed = usePipelineView((s) => s.toggleCollapsed);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const startEditing = () => {
    if (!source.editable) return;
    cancelled.current = false;
    setEditing(true);
  };
  const columns = source.groups.map((g) => g.column);
  const index = columns.findIndex((c) => c.id === column.id);
  const removable = source.canRemove(column.id);
  const renamed = column.name.toLowerCase() !== stageLabel(column.stage).toLowerCase();
  const hasActions = source.editable || (column.stage === "creation" && !!source.newSong);

  return (
    <div
      draggable={source.editable && !editing}
      onDragStart={(e) => startColumnDrag(e, column.id)}
      title={source.editable && !editing ? "Drag to reorder columns" : undefined}
      className={`group/col relative min-w-0 ${source.editable ? "cursor-grab active:cursor-grabbing" : ""} ${className}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          onClick={() => toggleCollapsed(source.scope, view, column.id)}
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
              if (!cancelled.current) source.rename(column.id, e.currentTarget.value);
              cancelled.current = false;
              setEditing(false);
            }}
            className="min-w-0 flex-1 rounded border border-hot bg-chassis px-1 py-0 text-xs font-medium text-cream focus:outline-none"
          />
        ) : (
          <button
            onDoubleClick={startEditing}
            onKeyDown={(e) => source.editable && (e.key === "Enter" || e.key === "F2") && (e.preventDefault(), startEditing())}
            title={source.editable ? "Double-click (or Enter) to rename" : undefined}
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
      {!editing && hasActions && (
        <span className="absolute right-0 top-0 flex items-center gap-0.5 rounded bg-panel pl-1 opacity-0 focus-within:opacity-100 group-hover/col:opacity-100">
          {column.stage === "creation" && source.newSong && (
            <button onClick={source.newSong} title="New song" aria-label="New song" className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream">
              <Plus size={13} />
            </button>
          )}
          {source.editable && (
            <>
              <button onClick={() => source.moveColumn(column.id, index - 1)} disabled={index <= 0} title="Move left" aria-label={`Move ${column.name} earlier`} className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream disabled:opacity-30">
                <ArrowLeft size={12} />
              </button>
              <button onClick={() => source.moveColumn(column.id, index + 1)} disabled={index >= columns.length - 1} title="Move right" aria-label={`Move ${column.name} later`} className="rounded p-0.5 text-engrave hover:bg-rule hover:text-cream disabled:opacity-30">
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
                  onConfirm={() => source.remove(column.id)}
                  className="rounded border border-transparent p-0.5 text-[10px] text-engrave hover:bg-rule hover:text-cream disabled:opacity-30"
                />
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}

// ---- Add a column ----

export function AddColumn({ compact = false }: { compact?: boolean }) {
  const source = useSource();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<SongStatus | null>("production");
  if (!source.editable || source.query) return null;
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
    source.add(name, stage);
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

// ---- Bits ----

export function ConflictDot({ on }: { on?: boolean }) {
  if (!on) return null;
  return (
    <span
      title="A crewmate moved this song on the crew board too: open it to choose"
      aria-label="Stage conflict"
      className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
    />
  );
}

/** The orange line where a dragged song will land. */
export function DropLine() {
  return <div className="h-0.5 rounded-full bg-hot" aria-hidden />;
}

/** A source's error, above the views. */
export function SourceError() {
  const { error } = useSource();
  if (!error) return null;
  return <div className="mx-4 mt-3 rounded-md border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-cream">{error}</div>;
}
