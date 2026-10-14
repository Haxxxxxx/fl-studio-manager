import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { usePipelineView } from "../../store/usePipelineView";
import { stageColor } from "../../lib/pipeline";
import { StatusDot } from "../ui";
import { AddColumn, beforePathFor, ColumnHeader, DropLine, SongCard, usePipelineDrop, usePipelineModel } from "./shared";

/** Kanban: one column per pipeline column. Drag cards between and within
 * columns, drag a header to reorder columns. */
export function PipelineBoard() {
  const { songs, groups, query } = usePipelineModel();
  const collapsed = usePipelineView((s) => s.collapsed.board);
  const toggleCollapsed = usePipelineView((s) => s.toggleCollapsed);
  const openDetail = useAppStore((s) => s.openDetail);
  const detailPath = useAppStore((s) => s.detailPath);
  const dnd = usePipelineDrop(songs);

  return (
    <div className="flex flex-1 gap-3 overflow-x-auto p-4" onDragEnd={dnd.end}>
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
            className={`flex flex-col rounded-lg border ${isCollapsed ? "w-11 shrink-0" : "min-w-[190px] flex-1 basis-0"} ${
              active ? "border-orange-400/50 bg-orange-500/[0.05]" : "border-rule bg-panel"
            }`}
          >
            {isCollapsed ? (
              <button
                onClick={() => toggleCollapsed("board", column.id)}
                aria-label={`Expand ${column.name}`}
                aria-expanded={false}
                className="flex flex-1 flex-col items-center gap-2 py-2.5 text-engrave hover:text-cream"
              >
                <ChevronRight size={13} />
                <StatusDot color={stageColor(column.stage)} />
                <span className="text-xs text-cream [writing-mode:vertical-rl]">{column.name}</span>
                <span className="text-xs">{items.length}</span>
              </button>
            ) : (
              <>
                <ColumnHeader column={column} count={items.length} view="board" collapsed={false} className="px-2.5 pb-2 pt-2.5" />
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                  {items.map((p, i) => (
                    <Fragment key={p.path}>
                      {dnd.spot?.columnId === column.id && dnd.spot.beforePath === p.path && <DropLine />}
                      <div onDragOver={(e) => dnd.over(e, column.id, query ? null : beforePathFor(e, items, i))}>
                        <SongCard song={p} selected={detailPath === p.path} onOpen={() => openDetail(detailPath === p.path ? null : p.path)} />
                      </div>
                    </Fragment>
                  ))}
                  {dnd.spot?.columnId === column.id && dnd.spot.beforePath === null && items.length > 0 && <DropLine />}
                </div>
              </>
            )}
          </section>
        );
      })}
      {!query && <AddColumn />}
    </div>
  );
}
