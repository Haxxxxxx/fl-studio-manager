import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckSquare,
  Download,
  FolderSearch,
  LayoutTemplate,
  Archive,
  Music2,
  Package,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Square,
  Star,
  X,
} from "lucide-react";
import { useAppStore, type SortKey, type StatusFilter } from "../store/useAppStore";
import { useCrewStore } from "../store/useCrewStore";
import { useCanShare } from "./CrewPanel";
import { detectKey } from "../lib/people";
import { formatDate } from "../lib/format";
import {
  KEYS,
  STATUSES,
  UNSORTED,
  albumsOf,
  formatBpm,
  hasProblems,
  missingPlugins,
  missingSamples,
  songLabel,
} from "../lib/songs";
import type { ProjectInfo, SongStatus } from "../types";
import { StatusDot, StatusSelect, btn, btnPrimary } from "./ui";
import { Chip, MixdownBadge, Toggle } from "../ui";

const STATUS_ORDER: Record<string, number> = Object.fromEntries(STATUSES.map((s, i) => [s.id, i + 1]));

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "name", label: "Song" },
  { key: "status", label: "Status" },
  { key: "tempo", label: "BPM" },
  { key: "key", label: "Key" },
  { key: "modified", label: "Last saved" },
  { key: "versions", label: "Backups" },
  { key: null, label: "Mixdown" },
  { key: null, label: "Album" },
];

/** Songs shown in the library, board and stats. Templates only when their
 * toggle is on; archived songs never — except in the library's Archived
 * view (`followArchivedToggle`), which shows only them. */
export function useVisibleSongs(followArchivedToggle = false): ProjectInfo[] {
  const projects = useAppStore((s) => s.projects);
  const songs = useAppStore((s) => s.workspace.songs);
  const showTemplates = useAppStore((s) => s.showTemplates);
  const showArchived = useAppStore((s) => s.showArchived) && followArchivedToggle;
  return useMemo(
    () =>
      projects.filter(
        (p) => (showTemplates || !p.isTemplate) && (showArchived ? songs[p.path]?.archived : !songs[p.path]?.archived),
      ),
    [projects, songs, showTemplates, showArchived],
  );
}

export function LibraryView() {
  const songs = useVisibleSongs(true);
  const showArchived = useAppStore((s) => s.showArchived);
  const setShowArchived = useAppStore((s) => s.setShowArchived);
  const startPackage = useAppStore((s) => s.startPackage);
  const packaging = useAppStore((s) => s.packaging);
  const archivedCount = useAppStore(
    (s) => s.projects.filter((p) => s.workspace.songs[p.path]?.archived).length,
  );
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const scanning = useAppStore((s) => s.scanning);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const selected = useAppStore((s) => s.selected);
  const toggleSelected = useAppStore((s) => s.toggleSelected);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const rescan = useAppStore((s) => s.rescan);
  const startRender = useAppStore((s) => s.startRender);
  const rendering = useAppStore((s) => s.rendering);
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const sortKey = useAppStore((s) => s.sortKey);
  const sortDir = useAppStore((s) => s.sortDir);
  const setSort = useAppStore((s) => s.setSort);
  const statusFilter = useAppStore((s) => s.statusFilter);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const tagFilter = useAppStore((s) => s.tagFilter);
  const setTagFilter = useAppStore((s) => s.setTagFilter);
  const favoritesOnly = useAppStore((s) => s.favoritesOnly);
  const setFavoritesOnly = useAppStore((s) => s.setFavoritesOnly);
  const showTemplates = useAppStore((s) => s.showTemplates);
  const setShowTemplates = useAppStore((s) => s.setShowTemplates);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const pluginFilter = useAppStore((s) => s.pluginFilter);
  const setPluginFilter = useAppStore((s) => s.setPluginFilter);
  const problemsOnly = useAppStore((s) => s.problemsOnly);
  const setProblemsOnly = useAppStore((s) => s.setProblemsOnly);
  const updateSong = useAppStore((s) => s.updateSong);
  const setStatus = useAppStore((s) => s.setStatus);
  const addTracks = useAppStore((s) => s.addTracks);
  const detailPath = useAppStore((s) => s.detailPath);
  const openDetail = useAppStore((s) => s.openDetail);
  const openNewProject = useAppStore((s) => s.openNewProject);
  const [error, setError] = useState<string | null>(null);

  const statusOf = (p: ProjectInfo) => workspace.songs[p.path]?.status;
  const templateCount = projects.length - projects.filter((p) => !p.isTemplate).length;

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of songs) {
      const key = workspace.songs[p.path]?.status ?? "unsorted";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [songs, workspace.songs]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of songs)
      for (const t of workspace.songs[p.path]?.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [songs, workspace.songs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = songs;
    if (q) {
      list = list.filter((p) => {
        const meta = workspace.songs[p.path];
        return (
          p.name.toLowerCase().includes(q) ||
          p.folder.toLowerCase().includes(q) ||
          meta?.notes?.toLowerCase().includes(q) ||
          meta?.tags?.some((t) => t.includes(q)) ||
          meta?.key?.toLowerCase() === q ||
          p.plugins.some((x) => x.name.toLowerCase().includes(q)) ||
          // "Which songs use this sample / pack?" — match file names only.
          p.samples.some((s) => (s.path.split(/[/\\]/).pop() ?? "").toLowerCase().includes(q))
        );
      });
    }
    if (pluginFilter) {
      list = list.filter((p) => p.plugins.some((x) => x.name === pluginFilter));
    }
    if (problemsOnly) {
      list = list.filter(hasProblems);
    }
    if (statusFilter) {
      list = list.filter((p) => (statusOf(p) ?? "unsorted") === statusFilter);
    }
    if (tagFilter) {
      list = list.filter((p) => workspace.songs[p.path]?.tags?.includes(tagFilter));
    }
    if (favoritesOnly) {
      list = list.filter((p) => settings.favorites.includes(p.path));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "status")
        return ((STATUS_ORDER[statusOf(a) ?? ""] ?? 0) - (STATUS_ORDER[statusOf(b) ?? ""] ?? 0)) * dir;
      if (sortKey === "tempo") return ((a.tempoBpm ?? -1) - (b.tempoBpm ?? -1)) * dir;
      if (sortKey === "key") {
        const ka = workspace.songs[a.path]?.key ?? "";
        const kb = workspace.songs[b.path]?.key ?? "";
        return (KEYS.indexOf(ka) - KEYS.indexOf(kb)) * dir;
      }
      if (sortKey === "versions") return (a.backups.length - b.backups.length) * dir;
      return (a.modifiedAtMs - b.modifiedAtMs) * dir;
    });
    // statusOf only reads workspace.songs, which is listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, workspace.songs, search, statusFilter, tagFilter, pluginFilter, problemsOnly, favoritesOnly, settings.favorites, sortKey, sortDir]);

  const problemCount = useMemo(() => songs.filter(hasProblems).length, [songs]);

  const { can: canShare, crewName } = useCanShare();
  const setShared = useCrewStore((s) => s.setShared);
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.path));
  const selectedPaths = Array.from(selected);

  async function handleRender() {
    setError(null);
    try {
      await startRender();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (settings.watchedFolders.length === 0 && !demoMode) {
    return <EmptyLibrary />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-6 py-3 [&_button]:whitespace-nowrap">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search songs, tags, notes, plugins, samples…"
            className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-orange-400/50 focus:outline-none"
          />
        </div>
        <button onClick={() => rescan()} disabled={scanning || demoMode} className={btn} title="Rescan folders">
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
        </button>
        <Toggle active={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>
          <Star size={14} /> Favorites
        </Toggle>
        {(problemCount > 0 || problemsOnly) && (
          <Toggle active={problemsOnly} onClick={() => setProblemsOnly(!problemsOnly)}>
            <AlertTriangle size={14} /> Issues ({problemCount})
          </Toggle>
        )}
        {(archivedCount > 0 || showArchived) && (
          <Toggle active={showArchived} onClick={() => setShowArchived(!showArchived)}>
            <Archive size={14} /> Archived ({archivedCount})
          </Toggle>
        )}
        {templateCount > 0 && (
          <Toggle active={showTemplates} onClick={() => setShowTemplates(!showTemplates)}>
            <LayoutTemplate size={14} /> Templates ({templateCount})
          </Toggle>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => openNewProject()} className={btn}>
            <Plus size={14} /> New song
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-6 py-2">
        <Chip active={statusFilter === null} onClick={() => setStatusFilter(null)}>
          All <span className="text-white/35">{songs.length}</span>
        </Chip>
        {[{ id: "unsorted" as const, ...UNSORTED }, ...STATUSES].map((s) => {
          const count = statusCounts.get(s.id) ?? 0;
          if (!count && statusFilter !== s.id) return null;
          return (
            <Chip
              key={s.id}
              active={statusFilter === s.id}
              onClick={() => setStatusFilter(statusFilter === s.id ? null : (s.id as StatusFilter))}
            >
              <StatusDot color={s.color} /> {s.label} <span className="text-white/35">{count}</span>
            </Chip>
          );
        })}
        {pluginFilter && (
          <Chip active onClick={() => setPluginFilter(null)}>
            <Plug size={11} /> {pluginFilter} <X size={11} />
          </Chip>
        )}
        {tags.length > 0 && <span className="mx-2 h-4 w-px bg-white/10" />}
        {tags.slice(0, 12).map(([tag, count]) => (
          <Chip key={tag} active={tagFilter === tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>
            #{tag} <span className="text-white/35">{count}</span>
            {tagFilter === tag && <X size={11} />}
          </Chip>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-b border-orange-400/20 bg-orange-500/[0.06] px-6 py-2 text-sm">
          <span className="text-orange-200">{selected.size} selected</span>
          <BulkSelect
            label="Set status"
            options={[{ value: "", label: UNSORTED.label }, ...STATUSES.map((s) => ({ value: s.id, label: s.label }))]}
            onPick={(v) => setStatus(selectedPaths, (v || undefined) as SongStatus | undefined)}
          />
          {workspace.albums.length > 0 && (
            <BulkSelect
              label="Add to release"
              options={workspace.albums.map((a) => ({ value: a.id, label: a.title }))}
              onPick={(id) => addTracks(id, selectedPaths)}
            />
          )}
          {canShare && (
            <BulkSelect
              label="Crew"
              options={[
                { value: "share", label: `Share with ${crewName}` },
                { value: "unshare", label: "Stop sharing" },
              ]}
              onPick={(v) => setShared(selectedPaths, v === "share")}
            />
          )}
          <BulkSelect
            label="Archive"
            options={[
              { value: "archive", label: "Archive selected" },
              { value: "unarchive", label: "Unarchive selected" },
            ]}
            onPick={(v) => {
              for (const p of selectedPaths) updateSong(p, { archived: v === "archive" });
              clearSelection();
            }}
          />
          <button
            onClick={() => startPackage(selectedPaths).catch((e) => setError(e instanceof Error ? e.message : String(e)))}
            disabled={packaging || demoMode}
            className={`${btn} ml-auto py-1 text-xs`}
            title="Zip each selected song with its samples"
          >
            <Package size={13} /> Package {selected.size}
          </button>
          <button onClick={handleRender} disabled={rendering || demoMode} className={btnPrimary}>
            <Download size={14} />
            {rendering ? "Rendering…" : `Export ${selected.size}`}
          </button>
          <button onClick={clearSelection} className="rounded p-1 text-white/40 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {demoMode && (
        <div className="mx-6 mt-3 rounded-md border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
          Sample data — changes aren't saved and export is disabled until you link a real project folder.
        </div>
      )}
      {error && (
        <div className="mx-6 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 py-2">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
            <Music2 size={28} />
            <div className="text-sm">{scanning ? "Scanning your project folders…" : "No songs match"}</div>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-0.5 text-sm">
            <thead className="sticky top-0 z-10 bg-[#0f0f12]">
              <tr className="text-left text-[11px] uppercase tracking-wide text-white/30">
                <th className="w-8 px-2 py-2">
                  <button
                    onClick={() => (allSelected ? clearSelection() : selectAll(filtered.map((p) => p.path)))}
                    className="flex text-white/40 hover:text-white/70"
                  >
                    {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                </th>
                <th className="w-6 px-1 py-2" />
                {COLUMNS.map((col) => (
                  <th key={col.label} className="whitespace-nowrap px-2 py-2 font-medium">
                    {col.key ? (
                      <button
                        onClick={() => setSort(col.key!)}
                        className={`flex items-center gap-1 hover:text-white/70 ${sortKey === col.key ? "text-white/70" : ""}`}
                      >
                        {col.label}
                        <ArrowUpDown size={10} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const isSelected = selected.has(project.path);
                const isOpen = detailPath === project.path;
                const isFavorite = settings.favorites.includes(project.path);
                const meta = workspace.songs[project.path];
                const albums = albumsOf(workspace, project.path);
                return (
                  <tr
                    key={project.path}
                    onClick={() => openDetail(isOpen ? null : project.path)}
                    className={`cursor-pointer ${
                      isOpen ? "bg-white/[0.07]" : isSelected ? "bg-orange-500/10" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <td className="rounded-l-md px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelected(project.path)} className="flex text-white/40 hover:text-white/70">
                        {isSelected ? <CheckSquare size={15} className="text-orange-400" /> : <Square size={15} />}
                      </button>
                    </td>
                    <td className="px-1 py-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleFavorite(project.path)} className="flex text-white/20 hover:text-orange-300">
                        <Star size={13} fill={isFavorite ? "currentColor" : "none"} className={isFavorite ? "text-orange-400" : ""} />
                      </button>
                    </td>
                    <td className="max-w-[280px] px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-white/90" title={project.path}>
                          {songLabel(project, songs)}
                        </span>
                        {hasProblems(project) && <ProblemIcon project={project} />}
                        {project.isTemplate && (
                          <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase text-white/50">template</span>
                        )}
                      </div>
                      {meta?.tags && meta.tags.length > 0 && (
                        <div className="mt-0.5 truncate text-[11px] text-white/35">
                          {meta.tags.map((t) => `#${t}`).join("  ")}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <StatusSelect compact value={meta?.status} onChange={(status) => updateSong(project.path, { status })} />
                    </td>
                    <td className="px-2 py-2 tabular-nums text-white/50">{formatBpm(project.tempoBpm)}</td>
                    <td className="px-2 py-2 text-white/60">
                      {meta?.key ??
                        (detectKey(project.trackNames) ? (
                          <span className="italic text-white/35" title="Found in a mixer track name — set it in the song panel">
                            {detectKey(project.trackNames)}?
                          </span>
                        ) : (
                          <span className="text-white/20">—</span>
                        ))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-white/50">{formatDate(project.modifiedAtMs)}</td>
                    <td className="px-2 py-2 tabular-nums text-white/40">{project.backups.length || "—"}</td>
                    <td className="px-2 py-2">
                      <MixdownBadge project={project} />
                    </td>
                    <td className="rounded-r-md px-2 py-2">
                      <div className="flex max-w-[160px] items-center gap-1.5 truncate text-xs text-white/50">
                        {albums.map((a) => (
                          <span key={a.id} className="flex items-center gap-1 truncate" title={a.title}>
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: a.color }} />
                            {albums.length === 1 && <span className="truncate">{a.title}</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ProblemIcon({ project }: { project: ProjectInfo }) {
  const plugins = missingPlugins(project).map((p) => p.name);
  const samples = missingSamples(project).length;
  const lines = [
    plugins.length ? `Plugins not installed: ${plugins.join(", ")}` : "",
    samples ? `${samples} missing sample${samples === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return (
    <span title={lines.join("\n")} className="shrink-0 text-red-400" aria-label={lines.join(". ")}>
      <AlertTriangle size={12} />
    </span>
  );
}

function BulkSelect({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
}) {
  return (
    <label className={`${btn} relative cursor-pointer py-1 text-xs`}>
      {label}
      <select
        value="__"
        onChange={(e) => onPick(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="__" disabled>
          {label}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** First run: no folder linked. Offers FL's default folder when it exists. */
export function EmptyLibrary() {
  const suggested = useAppStore((s) => s.suggestedFolder);
  const linkFolder = useAppStore((s) => s.linkFolder);
  const addWatchedFolder = useAppStore((s) => s.addWatchedFolder);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => () => {
    setError(null);
    fn().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/30">
        <FolderSearch size={28} />
      </div>
      <div className="text-base font-medium text-white/80">No project folder linked yet</div>
      {suggested ? (
        <div className="max-w-md text-sm text-white/40">
          Found your FL Studio projects folder:
          <div className="mt-1.5 truncate rounded bg-white/5 px-2 py-1 font-mono text-xs text-white/60" title={suggested}>
            {suggested}
          </div>
        </div>
      ) : (
        <div className="max-w-sm text-sm text-white/40">
          Point FL Manager at the folder where your FL Studio projects live — by default
          Documents/Image-Line/FL Studio/Projects.
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {suggested && (
          <button onClick={run(() => linkFolder(suggested))} className={btnPrimary}>
            Use this folder
          </button>
        )}
        <button onClick={run(addWatchedFolder)} className={suggested ? btn : btnPrimary}>
          {suggested ? "Choose another…" : "Link a project folder"}
        </button>
        <button onClick={loadDemoData} className={btn}>
          Load sample data
        </button>
      </div>
      {error && <div className="max-w-md text-xs text-red-300">{error}</div>}
    </div>
  );
}
