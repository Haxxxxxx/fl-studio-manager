import { useMemo, useState } from "react";
import { CheckCircle2, Disc3 } from "lucide-react";
import { useCrewStore } from "../store/useCrewStore";
import { useAppStore } from "../store/useAppStore";
import { pathsByShareId } from "../lib/crewSync";
import { STATUSES, UNSORTED } from "../lib/songs";
import { formatRelative } from "../lib/format";
import type { CrewSongRow, SongStatus } from "../types";
import { StatusDot } from "./ui";

const COLUMNS: { id: SongStatus | undefined; label: string; color: string; hint: string }[] = [{ id: undefined, ...UNSORTED }, ...STATUSES];

/** The shared board: every song the crew shares, by stage. Anyone can move any card. */
export function CrewBoard() {
  const songs = useCrewStore((s) => s.songs);
  const members = useCrewStore((s) => s.members);
  const userId = useCrewStore((s) => s.userId);
  const moveCrewSong = useCrewStore((s) => s.moveCrewSong);
  const workspace = useAppStore((s) => s.workspace);
  const openDetail = useAppStore((s) => s.openDetail);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameOf = useMemo(() => new Map(members.map((m) => [m.user_id, m.display_name])), [members]);
  const localPath = useMemo(() => pathsByShareId(workspace), [workspace]);
  const columns = useMemo(() => {
    const by = new Map<string, CrewSongRow[]>(COLUMNS.map((c) => [c.id ?? "", []]));
    for (const s of songs) by.get(s.stage ?? "")?.push(s);
    return by;
  }, [songs]);

  if (songs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-body">
        Nothing shared yet. Share songs from their panel or the Library, and ask the crew to do the same.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && <div className="mx-4 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
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
                const id = e.dataTransfer.getData("application/x-crew-song");
                if (!id) return;
                setError(null);
                moveCrewSong(id, col.id ?? null).catch((err) => setError(err instanceof Error ? err.message : String(err)));
              }}
              className={`flex min-w-[190px] flex-1 basis-0 flex-col rounded-lg border ${
                dragOver === key ? "border-orange-400/50 bg-orange-500/[0.05]" : "border-rule bg-panel"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 px-3 pb-2 pt-2.5">
                <StatusDot color={col.color} />
                <span className="text-xs font-medium text-cream">{col.label}</span>
                <span className="text-xs text-engrave">{items.length}</span>
                <span className="basis-full pt-0.5 text-[10px] leading-snug text-engrave">{col.hint}</span>
              </div>
              <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2">
                {items.map((s) => {
                  const mine = s.owner_id === userId;
                  const path = mine ? localPath.get(s.id) : undefined;
                  return (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/x-crew-song", s.id)}
                      onClick={() => path && openDetail(path)}
                      title={mine ? "Your song" : `${nameOf.get(s.owner_id) ?? "A crewmate"}'s song`}
                      className={`cursor-grab rounded-md border px-3 py-2 active:cursor-grabbing ${mine ? "border-orange-400/20 bg-raised" : "border-rule bg-raised"} hover:border-rule-strong`}
                    >
                      <div className="truncate text-sm font-medium text-cream">{s.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-body">
                        <span className={mine ? "text-orange-200/80" : ""}>{mine ? "You" : (nameOf.get(s.owner_id) ?? "Crewmate")}</span>
                        {s.bpm != null && <span>· {Math.round(s.bpm)} BPM</span>}
                        {s.musical_key && <span>· {s.musical_key}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-engrave">
                        {s.last_saved_at && <span>saved {formatRelative(Date.parse(s.last_saved_at))}</span>}
                        {s.release_date && <span>· out {s.release_date}</span>}
                        <span className="ml-auto flex items-center gap-1">
                          {s.has_mixdown && <Disc3 size={10} aria-label="Has a mixdown" />}
                          {s.kit_accepted && <CheckCircle2 size={10} className="text-emerald-300/80" aria-label="Launch Kit accepted" />}
                        </span>
                      </div>
                      {s.stage_updated_by && s.stage_updated_by !== s.owner_id && (
                        <div className="mt-1 text-[10px] text-engrave">moved by {s.stage_updated_by === userId ? "you" : (nameOf.get(s.stage_updated_by) ?? "a crewmate")}</div>
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
