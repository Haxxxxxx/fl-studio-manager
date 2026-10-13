import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Disc3, Search, Sparkles } from "lucide-react";
import { formatRelative } from "../lib/format";
import { formatBpm, renderFreshness, songLabel, stageRank, statusInfo } from "../lib/songs";
import type { ProjectInfo, Workspace } from "../types";
import { StatusDot } from "./ui";

// Launch Kit song picker: the current song as a readable card, and a
// searchable list grouped by how ready each song is to launch.

const GROUPS = [
  { id: "fresh", label: "Ready to launch", hint: "Mixdown is up to date" },
  { id: "stale", label: "Mixdown outdated", hint: "Saved in FL after the last mixdown" },
  { id: "none", label: "No mixdown yet", hint: "Render one to get snippets and a master" },
] as const;



function MixdownState({ song }: { song: ProjectInfo }) {
  const f = renderFreshness(song);
  if (f === "fresh") {
    return (
      <span className="flex items-center gap-1 text-emerald-300/90">
        <Disc3 size={11} /> Mixdown ready
      </span>
    );
  }
  if (f === "stale") {
    return (
      <span className="flex items-center gap-1 text-amber-300/90">
        <AlertTriangle size={11} /> Mixdown outdated
      </span>
    );
  }
  return <span className="text-white/35">No mixdown</span>;
}

function KitState({ song, workspace }: { song: ProjectInfo; workspace: Workspace }) {
  const kit = workspace.songs[song.path]?.launchKit;
  if (kit?.acceptedAtMs) {
    return (
      <span className="flex items-center gap-1 text-emerald-300/90">
        <CheckCircle2 size={11} /> Kit accepted
      </span>
    );
  }
  if (kit?.ai?.review || kit?.ai?.drafts) {
    return (
      <span className="flex items-center gap-1 text-violet-300/90">
        <Sparkles size={11} /> Kit in progress
      </span>
    );
  }
  if (kit?.edits && Object.keys(kit.edits).length) return <span className="text-white/50">Kit in progress</span>;
  return null;
}

export function SongPicker({
  songs,
  current,
  workspace,
  onSelect,
}: {
  songs: ProjectInfo[];
  current: ProjectInfo;
  workspace: Workspace;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Grouped by mixdown readiness, then closest to release, then last save.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = songs.filter((s) => {
      if (!q) return true;
      const meta = workspace.songs[s.path];
      return [s.name, statusInfo(meta?.status).label, meta?.key ?? "", ...(meta?.tags ?? [])].some((t) => t.toLowerCase().includes(q));
    });
    const rank = (s: ProjectInfo) => stageRank(workspace.songs[s.path]?.status);
    return GROUPS.map((g) => ({
      ...g,
      songs: matches.filter((s) => renderFreshness(s) === g.id).sort((a, b) => rank(a) - rank(b) || b.modifiedAtMs - a.modifiedAtMs),
    })).filter((g) => g.songs.length);
  }, [songs, workspace.songs, query]);
  const flat = groups.flatMap((g) => g.songs);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, flat.findIndex((s) => s.path === current.path)));
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function choose(song: ProjectInfo) {
    onSelect(song.path);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      choose(flat[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const meta = workspace.songs[current.path];
  const status = statusInfo(meta?.status);
  let index = -1;

  return (
    <div ref={root} className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group flex min-w-0 max-w-[34rem] items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-left hover:border-white/20 hover:bg-white/[0.07]"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-white">{songLabel(current, songs)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-white/50">
            <span className="flex items-center gap-1.5">
              <StatusDot color={status.color} size={7} /> {status.label}
            </span>
            {current.tempoBpm != null && <span>{formatBpm(current.tempoBpm)} BPM</span>}
            {meta?.key && <span>{meta.key}</span>}
            <MixdownState song={current} />
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-white/40 group-hover:text-white/70">
          Change song <ChevronDown size={14} className={open ? "rotate-180" : ""} />
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 flex max-h-[70vh] w-[30rem] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#17171c] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
            <Search size={14} className="text-white/35" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search songs, stage, key or tag"
              aria-label="Search songs"
              aria-controls="launch-song-list"
              aria-activedescendant={flat[active] ? `song-opt-${active}` : undefined}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            <kbd className="rounded border border-white/10 px-1 text-[10px] text-white/30">esc</kbd>
          </div>
          <div ref={listRef} id="launch-song-list" role="listbox" aria-label="Songs" className="overflow-y-auto py-1">
            {groups.length === 0 && <div className="px-4 py-6 text-center text-xs text-white/40">No song matches “{query}”.</div>}
            {groups.map((g) => (
              <div key={g.id} role="group" aria-label={g.label}>
                <div className="sticky top-0 flex items-baseline gap-2 bg-[#17171c] px-4 pb-1 pt-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-white/50">{g.label}</span>
                  <span className="text-[10px] text-white/25">
                    {g.songs.length} · {g.hint}
                  </span>
                </div>
                {g.songs.map((s) => {
                  index += 1;
                  const i = index;
                  const st = statusInfo(workspace.songs[s.path]?.status);
                  const selected = s.path === current.path;
                  return (
                    <div
                      key={s.path}
                      id={`song-opt-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(s)}
                      className={`mx-1.5 cursor-pointer rounded-lg px-3 py-2 ${i === active ? "bg-white/[0.07]" : ""} ${selected ? "ring-1 ring-orange-400/40" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/90">{songLabel(s, songs)}</span>
                        <span className="shrink-0 text-[11px] text-white/35">saved {formatRelative(s.modifiedAtMs)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/50">
                        <span className="flex items-center gap-1.5">
                          <StatusDot color={st.color} size={6} /> {st.label}
                        </span>
                        <MixdownState song={s} />
                        <KitState song={s} workspace={workspace} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 px-4 py-2 text-[10px] text-white/30">↑ ↓ to move · Enter to open · Esc to close</div>
        </div>
      )}
    </div>
  );
}
