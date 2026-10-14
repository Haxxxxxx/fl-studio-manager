import { create } from "zustand";
import type { SortKey } from "../lib/pipeline";

// Per-view display state of the pipeline: which view is open, which columns
// each view has collapsed, the table's sort. Kept on this computer only and
// never written to the workspace: sorting the table or collapsing a list
// section must not change the board.

export type PipelineViewKind = "board" | "list" | "table";

interface PipelineViewState {
  view: PipelineViewKind;
  /** Collapsed pipeline column ids, per view. */
  collapsed: Record<PipelineViewKind, string[]>;
  tableSort: { key: SortKey; dir: 1 | -1 };
  /** Search, shared by the three views while the page is open (not saved). */
  query: string;
  setView: (view: PipelineViewKind) => void;
  toggleCollapsed: (view: PipelineViewKind, columnId: string) => void;
  setTableSort: (key: SortKey) => void;
  setQuery: (query: string) => void;
}

const KEY = "hivo.pipelineView";
type Saved = Pick<PipelineViewState, "view" | "collapsed" | "tableSort">;
const DEFAULTS: Saved = { view: "board", collapsed: { board: [], list: [], table: [] }, tableSort: { key: "board", dir: 1 } };

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    if (!raw) return DEFAULTS;
    const view = raw.view === "list" || raw.view === "table" ? raw.view : "board";
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    const c = (raw.collapsed ?? {}) as Partial<Record<PipelineViewKind, unknown>>;
    const keys: SortKey[] = ["board", "name", "column", "saved", "bpm", "key"];
    const sortKey = keys.includes(raw.tableSort?.key as SortKey) ? (raw.tableSort!.key as SortKey) : "board";
    return {
      view,
      collapsed: { board: ids(c.board), list: ids(c.list), table: ids(c.table) },
      tableSort: { key: sortKey, dir: raw.tableSort?.dir === -1 ? -1 : 1 },
    };
  } catch {
    return DEFAULTS;
  }
}

function save(s: PipelineViewState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ view: s.view, collapsed: s.collapsed, tableSort: s.tableSort } satisfies Saved));
  } catch {
    // Storage full or blocked: the view just won't be remembered.
  }
}

export const usePipelineView = create<PipelineViewState>((set, get) => {
  const update = (patch: Partial<PipelineViewState>) => {
    set(patch);
    save(get());
  };
  return {
    ...load(),
    query: "",
    setView: (view) => update({ view }),
    toggleCollapsed: (view, columnId) => {
      const list = get().collapsed[view];
      update({ collapsed: { ...get().collapsed, [view]: list.includes(columnId) ? list.filter((x) => x !== columnId) : [...list, columnId] } });
    },
    setTableSort: (key) => {
      const cur = get().tableSort;
      update({ tableSort: { key, dir: cur.key === key ? (cur.dir === 1 ? -1 : 1) : key === "saved" ? -1 : 1 } });
    },
    setQuery: (query) => set({ query }),
  };
});
