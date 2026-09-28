import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatRelative } from "../lib/format";
import { STATUSES, UNSORTED, albumsOf, formatBpm } from "../lib/songs";
import type { ProjectInfo, SongStatus } from "../types";
import { EmptyLibrary, MixdownBadge, useVisibleSongs } from "./LibraryView";
import { StatusDot } from "./ui";

const COLUMNS: { id: SongStatus | undefined; label: string; color: string }[] = [
  { id: undefined, ...UNSORTED },
  ...STATUSES,
];

export function PipelineView() {
  const songs = useVisibleSongs();
  const workspace = useAppStore((s) => s.workspace);
  const setStatus = useAppStore((s) => s.setStatus);
  const openDetail = useAppStore((s) => s.openDetail);
  const detailPath = useAppStore((s) => s.detailPath);
  const openNewProject = useAppStore((s) => s.openNewProject);
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const setView = useAppStore((s) => s.setView);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const columns = useMemo(() => {
    const byStatus = new Map<string, ProjectInfo[]>(COLUMNS.map((c) => [c.id ?? "", []]));
    for (const p of songs) byStatus.get(workspace.songs[p.path]?.status ?? "")?.push(p);
    return byStatus;
  }, [songs, workspace.songs]);

  if (settings.watchedFolders.length === 0 && !demoMode) {
    return <EmptyLibrary onLink={() => setView("settings")} onDemo={loadDemoData} />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div>
          <h1 className="text-sm font-semibold text-white/90">Pipeline</h1>
          <p className="text-xs text-white/40">Drag songs between stages. Unsorted songs haven't been triaged yet.</p>
        </div>
      </div>
      <div className="flex flex-1 gap-3 overflow-x-auto p-4">
        {COLUMNS.map((col) => {
          const key = col.id ?? "";
          const items = columns.get(key) ?? [];
          return (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(key);
              }}
              onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const path = e.dataTransfer.getData("text/plain");
                if (path) setStatus([path], col.id);
              }}
              className={`flex w-60 shrink-0 flex-col rounded-lg border ${
                dragOver === key ? "border-orange-400/50 bg-orange-500/[0.05]" : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <StatusDot color={col.color} />
                <span className="text-xs font-medium text-white/80">{col.label}</span>
                <span className="text-xs text-white/30">{items.length}</span>
                {col.id === "idea" && (
                  <button
                    onClick={() => openNewProject({ status: "idea" })}
                    title="New song"
                    className="ml-auto rounded p-0.5 text-white/35 hover:bg-white/10 hover:text-white"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                {items.map((p) => {
                  const albums = albumsOf(workspace, p.path);
                  const tags = workspace.songs[p.path]?.tags ?? [];
                  return (
                    <div
                      key={p.path}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.path)}
                      onClick={() => openDetail(detailPath === p.path ? null : p.path)}
                      className={`cursor-grab rounded-md border px-3 py-2 active:cursor-grabbing ${
                        detailPath === p.path
                          ? "border-orange-400/40 bg-white/[0.08]"
                          : "border-white/5 bg-[#18181d] hover:border-white/15"
                      }`}
                    >
                      <div className="truncate text-sm font-medium text-white/90">{p.name}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-white/40">
                        <span>{formatRelative(p.modifiedAtMs)}</span>
                        {p.tempoBpm && <span>· {formatBpm(p.tempoBpm)} BPM</span>}
                      </div>
                      {(albums.length > 0 || tags.length > 0 || p.renders.length > 0) && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {albums.map((a) => (
                            <span key={a.id} title={a.title} className="h-2.5 w-2.5 rounded-sm" style={{ background: a.color }} />
                          ))}
                          <span className="min-w-0 flex-1 truncate text-[11px] text-white/30">
                            {tags.map((t) => `#${t}`).join(" ")}
                          </span>
                          {p.renders.length > 0 && <MixdownBadge project={p} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
