import { Fragment } from "react";
import { useAppStore } from "../../store/useAppStore";
import { usePipelineView } from "../../store/usePipelineView";
import { formatRelative } from "../../lib/format";
import { formatBpm, lastSaveMs } from "../../lib/songs";
import { MixdownBadge } from "../../ui";
import { AddColumn, beforePathFor, ColumnHeader, ConflictDot, DropLine, startSongDrag, usePipelineDrop, usePipelineModel } from "./shared";

const ROW = "grid grid-cols-[minmax(0,1fr)_7rem_4.5rem_3.5rem_minmax(0,10rem)_5.5rem] items-center gap-3";

/** The board as sections, one per column, one row per song. Same model and
 * drag rules as the board: drag rows to reorder or move them, drag a section
 * header to reorder columns. */
export function PipelineList() {
  const { songs, groups, workspace, query } = usePipelineModel();
  const collapsed = usePipelineView((s) => s.collapsed.list);
  const openDetail = useAppStore((s) => s.openDetail);
  const detailPath = useAppStore((s) => s.detailPath);
  const dnd = usePipelineDrop(songs);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4" onDragEnd={dnd.end}>
      <div className={`${ROW} px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-engrave`} aria-hidden>
        <span>Song</span>
        <span>Saved</span>
        <span>BPM</span>
        <span>Key</span>
        <span>Tags</span>
        <span className="text-right">Mixdown</span>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map(({ column, songs: items }, colIndex) => {
          const isCollapsed = collapsed.includes(column.id);
          const active = dnd.spot?.columnId === column.id || dnd.columnOver === column.id;
          return (
            <section
              key={column.id}
              aria-label={column.name}
              onDragOver={(e) => dnd.over(e, column.id, null)}
              onDragLeave={dnd.leave}
              onDrop={(e) => dnd.drop(e, column.id, colIndex)}
              className={`rounded-lg border ${active ? "border-orange-400/50 bg-orange-500/[0.05]" : "border-rule bg-panel"}`}
            >
              <ColumnHeader column={column} count={items.length} view="list" collapsed={isCollapsed} className="px-3 py-2" />
              {!isCollapsed && (
                <div role="list" className="flex flex-col gap-px px-1.5 pb-1.5">
                  {items.length === 0 && <div className="px-3 py-2 text-xs text-engrave">Nothing here. Drag a song in.</div>}
                  {items.map((p, i) => {
                    const meta = workspace.songs[p.path];
                    return (
                      <Fragment key={p.path}>
                        {dnd.spot?.columnId === column.id && dnd.spot.beforePath === p.path && <DropLine />}
                        <div
                          role="listitem"
                          draggable
                          onDragStart={(e) => startSongDrag(e, p.path)}
                          onDragOver={(e) => dnd.over(e, column.id, query ? null : beforePathFor(e, items, i))}
                          onClick={() => openDetail(detailPath === p.path ? null : p.path)}
                          className={`${ROW} cursor-grab rounded px-3 py-1.5 text-sm active:cursor-grabbing ${
                            detailPath === p.path ? "bg-raised ring-1 ring-orange-400/40" : "hover:bg-raised"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-medium text-cream">{p.name}</span>
                            <ConflictDot path={p.path} />
                          </span>
                          <span className="text-xs text-engrave">{formatRelative(lastSaveMs(p))}</span>
                          <span className="font-mono text-xs text-body">{formatBpm(p.tempoBpm)}</span>
                          <span className="font-mono text-xs text-body">{meta?.key || "—"}</span>
                          <span className="truncate text-xs text-engrave">{(meta?.tags ?? []).map((t) => `#${t}`).join(" ")}</span>
                          <span className="flex justify-end">{p.renders.length > 0 && <MixdownBadge project={p} compact />}</span>
                        </div>
                      </Fragment>
                    );
                  })}
                  {dnd.spot?.columnId === column.id && dnd.spot.beforePath === null && items.length > 0 && <DropLine />}
                </div>
              )}
            </section>
          );
        })}
        {!query && <AddColumn compact />}
      </div>
    </div>
  );
}
