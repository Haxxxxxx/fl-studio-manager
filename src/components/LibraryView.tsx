import { useMemo, useState } from "react";
import {
  FolderOpen,
  FolderSearch,
  Music2,
  PlayCircle,
  RefreshCw,
  Search,
  Square,
  CheckSquare,
  Download,
  Star,
  ArrowUpDown,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatDate } from "../lib/format";
import { openInFlStudio, revealInFileManager } from "../lib/tauri";
import type { SortKey } from "../store/useAppStore";

const UNSPECIFIED = "Unspecified";

function folderLabel(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function formatBpm(bpm: number | null): string {
  return bpm == null ? "—" : `${bpm % 1 === 0 ? bpm : bpm.toFixed(1)}`;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "modified", label: "Modified" },
  { key: "size", label: "Size" },
  { key: "genre", label: "Genre" },
  { key: "tempo", label: "BPM" },
];

export function LibraryView() {
  const projects = useAppStore((s) => s.projects);
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
  const setView = useAppStore((s) => s.setView);
  const demoMode = useAppStore((s) => s.demoMode);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const sortKey = useAppStore((s) => s.sortKey);
  const sortDir = useAppStore((s) => s.sortDir);
  const setSort = useAppStore((s) => s.setSort);
  const folderFilter = useAppStore((s) => s.folderFilter);
  const setFolderFilter = useAppStore((s) => s.setFolderFilter);
  const genreFilter = useAppStore((s) => s.genreFilter);
  const setGenreFilter = useAppStore((s) => s.setGenreFilter);
  const favoritesOnly = useAppStore((s) => s.favoritesOnly);
  const setFavoritesOnly = useAppStore((s) => s.setFavoritesOnly);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const [error, setError] = useState<string | null>(null);

  const folders = useMemo(() => {
    const set = new Set(projects.map((p) => p.root));
    return Array.from(set);
  }, [projects]);

  const genres = useMemo(() => {
    const set = new Set(projects.map((p) => p.genre ?? UNSPECIFIED));
    return Array.from(set).sort((a, b) =>
      a === UNSPECIFIED ? 1 : b === UNSPECIFIED ? -1 : a.localeCompare(b),
    );
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.folder.toLowerCase().includes(q),
      );
    }
    if (folderFilter) {
      list = list.filter((p) => p.root === folderFilter);
    }
    if (genreFilter) {
      list = list.filter((p) => (p.genre ?? UNSPECIFIED) === genreFilter);
    }
    if (favoritesOnly) {
      list = list.filter((p) => settings.favorites.includes(p.path));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "size") return (a.sizeBytes - b.sizeBytes) * dir;
      if (sortKey === "genre")
        return (a.genre ?? "").localeCompare(b.genre ?? "") * dir;
      if (sortKey === "tempo")
        return ((a.tempoBpm ?? -1) - (b.tempoBpm ?? -1)) * dir;
      return (a.modifiedAtMs - b.modifiedAtMs) * dir;
    });
  }, [
    projects,
    search,
    folderFilter,
    genreFilter,
    favoritesOnly,
    settings.favorites,
    sortKey,
    sortDir,
  ]);

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.path));

  async function handleRender() {
    setError(null);
    try {
      await startRender();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (settings.watchedFolders.length === 0 && !demoMode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/30">
          <FolderSearch size={28} />
        </div>
        <div className="text-base font-medium text-white/80">
          No project folders linked yet
        </div>
        <div className="max-w-sm text-sm text-white/40">
          Point FL Manager at the folder(s) where your FL Studio projects
          live, and it'll index every .flp it finds.
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setView("settings")}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
          >
            Link a project folder
          </button>
          <button
            onClick={loadDemoData}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Load sample data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects or folders..."
            className="w-full rounded-md border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-orange-400/50 focus:outline-none"
          />
        </div>

        <button
          onClick={() => rescan()}
          disabled={scanning || demoMode}
          className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-50"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Rescan"}
        </button>

        <button
          onClick={() => setFavoritesOnly(!favoritesOnly)}
          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm ${
            favoritesOnly
              ? "border-orange-400/50 bg-orange-500/15 text-orange-300"
              : "border-white/10 text-white/60 hover:bg-white/5"
          }`}
        >
          <Star size={14} />
          Favorites
        </button>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-xs text-white/40">
              {selected.size} selected
            </span>
          )}
          <button
            onClick={handleRender}
            disabled={selected.size === 0 || rendering}
            className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={14} />
            {rendering ? "Rendering..." : `Export all (${selected.size})`}
          </button>
        </div>
      </div>

      {folders.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/5 px-6 py-2">
          <span className="pr-1 text-[11px] uppercase tracking-wide text-white/25">
            Folder
          </span>
          <button
            onClick={() => setFolderFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              folderFilter === null
                ? "bg-white/15 text-white"
                : "text-white/40 hover:bg-white/5"
            }`}
          >
            All
          </button>
          {folders.map((folder) => (
            <button
              key={folder}
              onClick={() => setFolderFilter(folder === folderFilter ? null : folder)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                folderFilter === folder
                  ? "bg-orange-500/20 text-orange-300"
                  : "text-white/40 hover:bg-white/5"
              }`}
            >
              {folderLabel(folder)}
              {folderFilter === folder && <X size={11} />}
            </button>
          ))}
        </div>
      )}

      {genres.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-6 py-2.5">
          <span className="pr-1 text-[11px] uppercase tracking-wide text-white/25">
            Type
          </span>
          <button
            onClick={() => setGenreFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs ${
              genreFilter === null
                ? "bg-white/15 text-white"
                : "text-white/40 hover:bg-white/5"
            }`}
          >
            All
          </button>
          {genres.map((genre) => (
            <button
              key={genre}
              onClick={() => setGenreFilter(genre === genreFilter ? null : genre)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
                genreFilter === genre
                  ? "bg-orange-500/20 text-orange-300"
                  : genre === UNSPECIFIED
                    ? "text-white/25 hover:bg-white/5"
                    : "text-white/40 hover:bg-white/5"
              }`}
            >
              {genre}
              {genreFilter === genre && <X size={11} />}
            </button>
          ))}
        </div>
      )}

      {demoMode && (
        <div className="mx-6 mt-3 rounded-md border border-orange-400/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
          Sample data — export is disabled until you link a real project folder in Settings.
        </div>
      )}

      {error && (
        <div className="mx-6 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-white/30">
            <Music2 size={28} />
            <div className="text-sm">
              {scanning ? "Scanning your project folders..." : "No projects found"}
            </div>
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-white/30">
                <th className="w-8 px-2 py-2">
                  <button
                    onClick={() =>
                      allSelected
                        ? clearSelection()
                        : selectAll(filtered.map((p) => p.path))
                    }
                    className="flex text-white/40 hover:text-white/70"
                  >
                    {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th className="w-8 px-2 py-2" />
                {COLUMNS.map((col) => (
                  <th key={col.key} className="px-2 py-2 font-medium">
                    <button
                      onClick={() => setSort(col.key)}
                      className={`flex items-center gap-1 hover:text-white/70 ${
                        sortKey === col.key ? "text-white/70" : ""
                      }`}
                    >
                      {col.label}
                      <ArrowUpDown size={11} />
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">Folder</th>
                <th className="w-24 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const isSelected = selected.has(project.path);
                const isFavorite = settings.favorites.includes(project.path);
                return (
                  <tr
                    key={project.path}
                    className={`group rounded-md ${isSelected ? "bg-orange-500/10" : "hover:bg-white/[0.03]"}`}
                  >
                    <td className="rounded-l-md px-2 py-2.5">
                      <button
                        onClick={() => toggleSelected(project.path)}
                        className="flex text-white/40 hover:text-white/70"
                      >
                        {isSelected ? (
                          <CheckSquare size={16} className="text-orange-400" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={() => toggleFavorite(project.path)}
                        className="flex text-white/25 hover:text-orange-300"
                      >
                        <Star
                          size={14}
                          fill={isFavorite ? "currentColor" : "none"}
                          className={isFavorite ? "text-orange-400" : ""}
                        />
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <Music2 size={14} className="shrink-0 text-white/25" />
                        <span className="truncate font-medium text-white/90">
                          {project.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-white/40">
                      {formatDate(project.modifiedAtMs)}
                    </td>
                    <td className="px-2 py-2.5 text-white/40">
                      {formatBytes(project.sizeBytes)}
                    </td>
                    <td className="px-2 py-2.5">
                      {project.genre ? (
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/60">
                          {project.genre}
                        </span>
                      ) : (
                        <span className="text-white/20">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-white/40">
                      {formatBpm(project.tempoBpm)}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-2 py-2.5 text-white/40"
                      title={project.folder}
                    >
                      {folderLabel(project.root)}
                    </td>
                    <td className="rounded-r-md px-2 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          title="Open in FL Studio"
                          onClick={() => openInFlStudio(project.path)}
                          disabled={demoMode}
                          className="rounded p-1.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-30"
                        >
                          <PlayCircle size={15} />
                        </button>
                        <button
                          title="Reveal in file manager"
                          onClick={() => revealInFileManager(project.path)}
                          disabled={demoMode}
                          className="rounded p-1.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-30"
                        >
                          <FolderOpen size={15} />
                        </button>
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
