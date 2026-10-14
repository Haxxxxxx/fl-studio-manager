import { useMemo } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { usePipelineView } from "../../store/usePipelineView";
import { flatRows, sortRows, stageColor, stageLabel, type SortKey } from "../../lib/pipeline";
import { formatRelative } from "../../lib/format";
import { formatBpm, lastSaveMs } from "../../lib/songs";
import { StatusDot } from "../ui";
import { ConflictDot, usePipelineModel } from "./shared";

const HEADERS: { key: SortKey; label: string; className?: string }[] = [
  { key: "name", label: "Song" },
  { key: "column", label: "Column" },
  { key: "saved", label: "Saved" },
  { key: "bpm", label: "BPM", className: "text-right" },
  { key: "key", label: "Key" },
];

/** One flat, sortable table over the same rows as the list. Its sort and
 * hidden columns are its own: they never reorder the board. Read-only: click
 * a row to open the song. */
export function PipelineTable() {
  const { groups, workspace } = usePipelineModel();
  const { key, dir } = usePipelineView((s) => s.tableSort);
  const setTableSort = usePipelineView((s) => s.setTableSort);
  const hidden = usePipelineView((s) => s.collapsed.table);
  const toggleCollapsed = usePipelineView((s) => s.toggleCollapsed);
  const openDetail = useAppStore((s) => s.openDetail);
  const detailPath = useAppStore((s) => s.detailPath);

  const rows = useMemo(
    () => sortRows(flatRows(groups.filter((g) => !hidden.includes(g.column.id))), key, dir, workspace),
    [groups, hidden, key, dir, workspace],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule px-6 py-2" role="group" aria-label="Columns shown">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-engrave">Show</span>
        {groups.map(({ column, songs }) => {
          const on = !hidden.includes(column.id);
          return (
            <button
              key={column.id}
              aria-pressed={on}
              onClick={() => toggleCollapsed("table", column.id)}
              className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${on ? "border-rule-strong text-cream" : "border-rule text-engrave line-through"}`}
            >
              <StatusDot color={stageColor(column.stage)} size={6} glow={false} /> {column.name} <span className="text-engrave">{songs.length}</span>
            </button>
          );
        })}
        {key !== "board" && (
          <button onClick={() => setTableSort("board")} className="ml-auto text-xs text-engrave underline hover:text-cream">
            Board order
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-6 pb-4">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-chassis">
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h.key}
                  scope="col"
                  aria-sort={key === h.key ? (dir === 1 ? "ascending" : "descending") : "none"}
                  className={`border-b border-rule px-2 py-2 font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-engrave ${h.className ?? "text-left"}`}
                >
                  <button onClick={() => setTableSort(h.key)} className="inline-flex items-center gap-1 uppercase hover:text-cream">
                    {h.label}
                    {key === h.key && (dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                </th>
              ))}
              <th scope="col" className="border-b border-rule px-2 py-2 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-engrave">
                Tags
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-xs text-engrave">
                  No songs to show.
                </td>
              </tr>
            )}
            {rows.map(({ song, column }) => {
              const meta = workspace.songs[song.path];
              return (
                <tr
                  key={song.path}
                  onClick={() => openDetail(detailPath === song.path ? null : song.path)}
                  className={`cursor-pointer border-b border-rule ${detailPath === song.path ? "bg-raised" : "hover:bg-panel"}`}
                >
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-cream">{song.name}</span>
                      <ConflictDot path={song.path} />
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-body" title={`Stage: ${stageLabel(column.stage)}`}>
                      <StatusDot color={stageColor(column.stage)} size={6} glow={false} /> {column.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-engrave">{formatRelative(lastSaveMs(song))}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-body">{formatBpm(song.tempoBpm)}</td>
                  <td className="px-2 py-1.5 font-mono text-xs text-body">{meta?.key || "—"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5 text-xs text-engrave">{(meta?.tags ?? []).map((t) => `#${t}`).join(" ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
