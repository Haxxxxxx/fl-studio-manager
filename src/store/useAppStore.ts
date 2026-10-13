import { create } from "zustand";
import * as api from "../lib/tauri";
import { generateSampleProjects, generateSampleWorkspace } from "../lib/sampleData";
import { ALBUM_COLORS, EMPTY_WORKSPACE, newId } from "../lib/songs";
import type {
  PackageResult,
  Person,
  Pitch,
  Album,
  ProjectInfo,
  RenderEvent,
  RenderStatus,
  Settings,
  SongMeta,
  AiStatus,
  CoverStatus,
  KitCoverMeta,
  KitAiMeta,
  KitFieldId,
  SongStatus,
  Workspace,
} from "../types";

const DEFAULT_SETTINGS: Settings = {
  watchedFolders: [],
  flStudioPath: null,
  outputFolder: null,
  renderFormat: "wav",
  favorites: [],
  aiModel: null,
  aiLanguage: null,
  ffmpegPath: null,
  aiProvider: null,
  claudeModel: null,
};

export type View = "dashboard" | "library" | "pipeline" | "albums" | "people" | "launch" | "settings";
export type SortKey = "modified" | "name" | "status" | "tempo" | "key" | "versions";
export type SortDir = "asc" | "desc";
/** "unsorted" = songs with no status yet. */
export type StatusFilter = SongStatus | "unsorted" | null;

interface RenderJob {
  status: RenderStatus;
  message: string | null;
  outputPath: string | null;
}

interface RenderOptions {
  /** Render into `<output folder>/<subfolder>` (album exports). */
  subfolder?: string;
  /** Output file names, aligned with the paths ("01 - Envy"). */
  names?: string[];
}

interface NewProjectDraft {
  albumId: string | null;
  status: SongStatus;
}

interface AppState {
  view: View;
  settings: Settings;
  settingsLoaded: boolean;
  startupError: string | null;
  /** FL's default projects folder when found and nothing is linked yet. */
  suggestedFolder: string | null;
  workspace: Workspace;
  /** False if the stored workspace couldn't be read — see loadWorkspace. */
  workspaceWritable: boolean;
  projects: ProjectInfo[];
  scanning: boolean;
  search: string;
  selected: Set<string>;
  renderJobs: Map<string, RenderJob>;
  rendering: boolean;
  unlisten: (() => void) | null;
  demoMode: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  statusFilter: StatusFilter;
  tagFilter: string | null;
  pluginFilter: string | null;
  /** Only songs with missing plugins or samples. */
  problemsOnly: boolean;
  showArchived: boolean;
  packaging: boolean;
  /** Results of the last package run; null hides the panel. */
  packageResults: PackageResult[] | null;
  favoritesOnly: boolean;
  showTemplates: boolean;
  /** Song open in the detail drawer. */
  detailPath: string | null;
  openAlbumId: string | null;
  openPersonId: string | null;
  /** Song shown in the Launch Kit view. */
  launchPath: string | null;
  newProject: NewProjectDraft | null;

  setView: (view: View) => void;
  setSearch: (search: string) => void;
  init: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addWatchedFolder: () => Promise<void>;
  /** Link a known folder (e.g. the suggested one) and scan it. */
  linkFolder: (folder: string) => Promise<void>;
  removeWatchedFolder: (folder: string) => Promise<void>;
  rescan: () => Promise<void>;
  toggleSelected: (path: string) => void;
  selectAll: (paths: string[]) => void;
  clearSelection: () => void;
  startRender: (paths?: string[], options?: RenderOptions) => Promise<void>;
  dismissRenderPanel: () => void;
  loadDemoData: () => void;
  exitDemoMode: () => Promise<void>;
  toggleFavorite: (path: string) => void;
  setSort: (key: SortKey) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setTagFilter: (tag: string | null) => void;
  setPluginFilter: (plugin: string | null) => void;
  setProblemsOnly: (value: boolean) => void;
  setShowArchived: (value: boolean) => void;
  /** Zip songs (with their samples) into `<export folder>/Packages[/subfolder]`. */
  startPackage: (paths: string[], subfolder?: string) => Promise<void>;
  dismissPackageResults: () => void;
  setFavoritesOnly: (value: boolean) => void;
  setShowTemplates: (value: boolean) => void;
  openDetail: (path: string | null) => void;
  openAlbum: (id: string | null) => void;
  openPerson: (id: string | null) => void;
  openLaunchKit: (path: string | null) => void;
  /** undefined resets the field to its generated value. */
  setKitEdit: (path: string, id: KitFieldId, value: string | undefined) => void;
  setSnippetStart: (path: string, label: string, startSec: number | undefined) => void;
  acceptKit: (path: string) => void;
  /** Merge AI drafts/review into a song's kit. */
  setKitAi: (path: string, patch: Partial<KitAiMeta>) => void;
  /** null until loaded; whether a Gemini key is set. */
  aiStatus: AiStatus | null;
  refreshAiStatus: () => Promise<void>;
  /** Set or clear the picked cover concept (metadata only). */
  setKitCover: (path: string, cover: KitCoverMeta | undefined) => void;
  /** null until loaded; whether Cloudflare credentials are set. */
  coverStatus: CoverStatus | null;
  refreshCoverStatus: () => Promise<void>;
  openNewProject: (draft?: Partial<NewProjectDraft>) => void;
  closeNewProject: () => void;

  // Song metadata
  updateSong: (path: string, patch: Partial<SongMeta>) => void;
  setStatus: (paths: string[], status: SongStatus | undefined) => void;

  // Albums
  createAlbum: (title: string) => string;
  updateAlbum: (id: string, patch: Partial<Omit<Album, "id">>) => void;
  deleteAlbum: (id: string) => void;

  // People (collaborators & contacts), credits and pitches
  createPerson: (name: string, aliases?: string[]) => string;
  updatePerson: (id: string, patch: Partial<Omit<Person, "id">>) => void;
  /** Also removes their credits and pitches. */
  deletePerson: (id: string) => void;
  addPitch: (path: string, pitch: Omit<Pitch, "id">) => void;
  updatePitch: (path: string, id: string, patch: Partial<Omit<Pitch, "id">>) => void;
  removePitch: (path: string, id: string) => void;
  addTracks: (albumId: string, paths: string[]) => void;
  removeTrack: (albumId: string, path: string) => void;
  moveTrack: (albumId: string, from: number, to: number) => void;

  // File actions (write to disk, then rescan)
  createProject: (args: {
    name: string;
    templatePath: string;
    parentFolder: string;
    albumId: string | null;
    status: SongStatus;
  }) => Promise<string>;
  duplicateProject: (path: string, newName: string) => Promise<string>;
  restoreBackup: (backupPath: string, projectPath: string) => Promise<string>;
  trashBackups: (paths: string[]) => Promise<number>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let scanSeq = 0;

export const useAppStore = create<AppState>((set, get) => {
  /** Apply a change to the workspace and persist it (debounced, so typing
   * notes doesn't write the file on every keystroke). Sample-data edits
   * stay in memory so they never clobber the real workspace. */
  function mutateWorkspace(fn: (ws: Workspace) => Workspace) {
    const next = fn(get().workspace);
    set({ workspace: next });
    if (get().demoMode || !get().workspaceWritable) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Re-check at fire time: sample data may have been loaded meanwhile.
      if (get().demoMode || !get().workspaceWritable) return;
      api.saveWorkspace(get().workspace).catch((e) => console.error("saving workspace failed", e));
    }, 400);
  }

  function mutateAlbum(id: string, fn: (album: Album) => Album) {
    mutateWorkspace((ws) => ({
      ...ws,
      albums: ws.albums.map((a) => (a.id === id ? fn(a) : a)),
    }));
  }

  async function loadWorkspace() {
    try {
      const stored = await api.getWorkspace();
      set({ workspace: stored ? { ...EMPTY_WORKSPACE, ...stored } : EMPTY_WORKSPACE, workspaceWritable: true });
    } catch (e) {
      // Never save over a workspace we couldn't read — that would wipe the
      // user's albums and statuses. Edits stay in memory until it's fixed.
      set({
        workspace: EMPTY_WORKSPACE,
        workspaceWritable: false,
        startupError: `Couldn't read your workspace (albums, statuses, notes): ${String(e)}. Changes won't be saved until it's fixed.`,
      });
    }
  }

  return {
    view: "dashboard",
    settings: DEFAULT_SETTINGS,
    settingsLoaded: false,
    startupError: null,
    suggestedFolder: null,
    workspace: EMPTY_WORKSPACE,
    workspaceWritable: false,
    projects: [],
    scanning: false,
    search: "",
    selected: new Set(),
    renderJobs: new Map(),
    rendering: false,
    unlisten: null,
    demoMode: false,
    sortKey: "modified",
    sortDir: "desc",
    statusFilter: null,
    tagFilter: null,
    pluginFilter: null,
    problemsOnly: false,
    showArchived: false,
    packaging: false,
    packageResults: null,
    favoritesOnly: false,
    showTemplates: false,
    detailPath: null,
    openAlbumId: null,
    openPersonId: null,
    launchPath: null,
    newProject: null,

    setView: (view) => set({ view }),
    setSearch: (search) => set({ search }),

    init: async () => {
      let settings: Settings;
      try {
        settings = await api.getSettings();
      } catch (e) {
        settings = { ...DEFAULT_SETTINGS };
        set({ startupError: `Couldn't read settings, using defaults: ${String(e)}` });
      }
      // First run on a machine with FL installed: fill the path in for them.
      if (!settings.flStudioPath) {
        settings.flStudioPath = await api.detectFlStudio().catch(() => null);
        if (settings.flStudioPath) await api.saveSettings(settings).catch(() => {});
      }
      set({ settings });
      await loadWorkspace();
      get().refreshAiStatus();
      get().refreshCoverStatus();
      set({ settingsLoaded: true });

      if (!get().unlisten) {
        const unlisten = await api.onRenderProgress((event: RenderEvent) => {
          set((state) => {
            const next = new Map(state.renderJobs);
            next.set(event.projectPath, {
              status: event.status,
              message: event.message,
              outputPath: event.outputPath,
            });
            return { renderJobs: next };
          });
        });
        set({ unlisten });
      }

      if (settings.watchedFolders.length > 0) {
        await get().rescan().catch((e) => set({ startupError: `Scanning failed: ${String(e)}` }));
      } else {
        // Fresh machine: offer FL's default folder as a one-click link.
        set({ suggestedFolder: await api.detectProjectsFolder().catch(() => null) });
      }
    },

    updateSettings: async (patch) => {
      const merged = { ...get().settings, ...patch };
      set({ settings: merged });
      await api.saveSettings(merged);
      if ("outputFolder" in patch) await get().rescan();
    },

    addWatchedFolder: async () => {
      const folder = await api.pickFolder();
      if (folder) await get().linkFolder(folder);
    },

    linkFolder: async (folder) => {
      const current = get().settings;
      if (current.watchedFolders.includes(folder)) return;
      // Leaving sample data: drop its fake albums/people before anything
      // can be saved over the real workspace.
      if (get().demoMode) {
        set({ demoMode: false, projects: [], selected: new Set(), detailPath: null, openAlbumId: null });
        await loadWorkspace();
      }
      set({ suggestedFolder: null });
      await get().updateSettings({
        watchedFolders: [...current.watchedFolders, folder],
      });
      await get().rescan();
    },

    removeWatchedFolder: async (folder) => {
      const current = get().settings;
      const remaining = current.watchedFolders.filter((f) => f !== folder);
      await get().updateSettings({ watchedFolders: remaining });
      await get().rescan();
      if (remaining.length === 0) {
        set({ suggestedFolder: await api.detectProjectsFolder().catch(() => null) });
      }
    },

    rescan: async () => {
      if (get().demoMode) return;
      const folders = get().settings.watchedFolders;
      if (folders.length === 0) {
        set({ projects: [] });
        return;
      }
      // Scans can overlap (window focus + adding a folder); only the newest
      // one may write, so a slow stale scan can't hide a new folder.
      const id = ++scanSeq;
      set({ scanning: true });
      try {
        const projects = await api.scanProjects(folders, get().settings.outputFolder);
        if (id === scanSeq && !get().demoMode) set({ projects });
      } finally {
        if (id === scanSeq) set({ scanning: false });
      }
    },

    toggleSelected: (path) =>
      set((state) => {
        const next = new Set(state.selected);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return { selected: next };
      }),

    selectAll: (paths) => set({ selected: new Set(paths) }),

    clearSelection: () => set({ selected: new Set() }),

    startRender: async (paths, options) => {
      const { settings, selected, demoMode } = get();
      if (demoMode) {
        throw new Error(
          "This is sample data — link a real project folder in Settings before exporting.",
        );
      }
      if (!settings.flStudioPath) {
        throw new Error("Set your FL Studio executable path in Settings first.");
      }
      if (!settings.outputFolder) {
        throw new Error("Set an export output folder in Settings first.");
      }
      const projectPaths = paths ?? Array.from(selected);
      if (projectPaths.length === 0) return;
      if (get().rendering) throw new Error("An export is already running.");

      const sep = settings.outputFolder.includes("\\") ? "\\" : "/";
      const outputFolder = options?.subfolder
        ? `${settings.outputFolder}${sep}${options.subfolder.replace(/[/\\:*?"<>|]/g, "_")}`
        : settings.outputFolder;

      const seedJobs = new Map(get().renderJobs);
      for (const path of projectPaths) {
        seedJobs.set(path, { status: "queued", message: null, outputPath: null });
      }
      set({ renderJobs: seedJobs, rendering: true });

      try {
        await api.renderProjects({
          projectPaths,
          outputFolder,
          flStudioPath: settings.flStudioPath,
          format: settings.renderFormat,
          outputNames: options?.names,
        });
      } finally {
        set({ rendering: false });
        // Pick up the new mixdowns (freshness badges, playback).
        get().rescan().catch(() => {});
      }
    },

    dismissRenderPanel: () => set({ renderJobs: new Map() }),

    loadDemoData: () => {
      // Flush a pending real save now, before the workspace is swapped.
      if (saveTimer && !get().demoMode && get().workspaceWritable) {
        clearTimeout(saveTimer);
        saveTimer = null;
        api.saveWorkspace(get().workspace).catch((e) => console.error("saving workspace failed", e));
      }
      const projects = generateSampleProjects();
      set({
        demoMode: true,
        projects,
        workspace: generateSampleWorkspace(projects),
        selected: new Set(),
        detailPath: null,
        openAlbumId: null,
        view: "dashboard",
      });
    },

    exitDemoMode: async () => {
      set({ demoMode: false, selected: new Set(), detailPath: null, openAlbumId: null });
      await loadWorkspace();
      await get().rescan();
    },

    toggleFavorite: (path) => {
      const current = get().settings;
      const isFavorite = current.favorites.includes(path);
      const favorites = isFavorite
        ? current.favorites.filter((p) => p !== path)
        : [...current.favorites, path];
      get().updateSettings({ favorites });
    },

    setSort: (key) =>
      set((state) => ({
        sortKey: key,
        sortDir: state.sortKey === key && state.sortDir === "desc" ? "asc" : "desc",
      })),

    setStatusFilter: (statusFilter) => set({ statusFilter }),
    setTagFilter: (tagFilter) => set({ tagFilter }),
    setPluginFilter: (pluginFilter) => set({ pluginFilter }),
    setProblemsOnly: (problemsOnly) => set({ problemsOnly }),
    setShowArchived: (showArchived) => set({ showArchived }),

    startPackage: async (paths, subfolder) => {
      const { settings, demoMode, packaging } = get();
      if (demoMode) throw new Error("This is sample data — link a real project folder first.");
      if (!settings.outputFolder) throw new Error("Set an export folder in Settings first — packages go in <export folder>\\Packages.");
      if (packaging) throw new Error("Already packaging.");
      if (paths.length === 0) return;
      const sep = settings.outputFolder.includes("\\") ? "\\" : "/";
      set({ packaging: true, packageResults: [] });
      // Results stream in per song so the panel can show progress.
      const unlisten = await api.onPackageProgress((r) =>
        set((s) => ({ packageResults: [...(s.packageResults ?? []), r] })),
      );
      try {
        await api.packageProjects({ projectPaths: paths, outputFolder: `${settings.outputFolder}${sep}Packages`, subfolder });
      } finally {
        unlisten();
        set({ packaging: false });
      }
    },

    dismissPackageResults: () => set({ packageResults: null }),
    setFavoritesOnly: (value) => set({ favoritesOnly: value }),
    setShowTemplates: (value) => set({ showTemplates: value }),
    openDetail: (detailPath) => set({ detailPath }),
    openAlbum: (openAlbumId) => set({ openAlbumId, view: "albums" }),
    openPerson: (openPersonId) => set({ openPersonId, view: "people" }),
    openLaunchKit: (launchPath) => set({ launchPath, view: "launch", detailPath: null }),

    setKitEdit: (path, id, value) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      const edits = { ...kit.edits };
      if (value === undefined) delete edits[id];
      else edits[id] = value;
      get().updateSong(path, { launchKit: { ...kit, edits, acceptedAtMs: undefined } });
    },

    setSnippetStart: (path, label, startSec) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      const snippetStarts = { ...kit.snippetStarts };
      if (startSec === undefined) delete snippetStarts[label];
      else snippetStarts[label] = startSec;
      get().updateSong(path, { launchKit: { ...kit, snippetStarts, acceptedAtMs: undefined } });
    },

    acceptKit: (path) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      get().updateSong(path, { launchKit: { ...kit, acceptedAtMs: Date.now() } });
    },

    setKitAi: (path, patch) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      // New or discarded drafts change the text, so the kit needs reviewing again.
      const acceptedAtMs = "drafts" in patch ? undefined : kit.acceptedAtMs;
      get().updateSong(path, { launchKit: { ...kit, acceptedAtMs, ai: { ...kit.ai, ...patch } } });
    },

    aiStatus: null,
    refreshAiStatus: async () => {
      const aiStatus = await api.aiStatus(get().settings.aiProvider).catch(() => null);
      set({ aiStatus });
    },
    setKitCover: (path, cover) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      get().updateSong(path, { launchKit: { ...kit, cover } });
    },
    coverStatus: null,
    refreshCoverStatus: async () => {
      const coverStatus = await api.coverStatus().catch(() => null);
      set({ coverStatus });
    },
    openNewProject: (draft) =>
      set({ newProject: { albumId: null, status: "idea", ...draft } }),
    closeNewProject: () => set({ newProject: null }),

    updateSong: (path, patch) =>
      mutateWorkspace((ws) => ({
        ...ws,
        songs: { ...ws.songs, [path]: { ...ws.songs[path], ...patch } },
      })),

    setStatus: (paths, status) =>
      mutateWorkspace((ws) => {
        const songs = { ...ws.songs };
        for (const p of paths) songs[p] = { ...songs[p], status };
        return { ...ws, songs };
      }),

    createAlbum: (title) => {
      const id = newId();
      mutateWorkspace((ws) => ({
        ...ws,
        albums: [
          ...ws.albums,
          {
            id,
            title: title.trim() || "Untitled album",
            kind: "album",
            color: ALBUM_COLORS[ws.albums.length % ALBUM_COLORS.length],
            releaseDate: null,
            notes: "",
            trackPaths: [],
            createdAtMs: Date.now(),
          },
        ],
      }));
      return id;
    },

    updateAlbum: (id, patch) => mutateAlbum(id, (a) => ({ ...a, ...patch })),

    createPerson: (name, aliases = []) => {
      const id = newId();
      mutateWorkspace((ws) => ({
        ...ws,
        people: [...ws.people, { id, name: name.trim() || "Someone", aliases, contact: "", notes: "" }],
      }));
      return id;
    },

    updatePerson: (id, patch) =>
      mutateWorkspace((ws) => ({ ...ws, people: ws.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

    deletePerson: (id) => {
      mutateWorkspace((ws) => {
        const songs: Workspace["songs"] = {};
        for (const [path, meta] of Object.entries(ws.songs)) {
          songs[path] = {
            ...meta,
            credits: meta.credits?.filter((c) => c.personId !== id),
            pitches: meta.pitches?.filter((p) => p.personId !== id),
          };
        }
        return { ...ws, songs, people: ws.people.filter((p) => p.id !== id) };
      });
      if (get().openPersonId === id) set({ openPersonId: null });
    },

    addPitch: (path, pitch) => {
      const pitches = get().workspace.songs[path]?.pitches ?? [];
      get().updateSong(path, { pitches: [...pitches, { ...pitch, id: newId() }] });
    },

    updatePitch: (path, id, patch) => {
      const pitches = get().workspace.songs[path]?.pitches ?? [];
      get().updateSong(path, { pitches: pitches.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    },

    removePitch: (path, id) => {
      const pitches = get().workspace.songs[path]?.pitches ?? [];
      get().updateSong(path, { pitches: pitches.filter((p) => p.id !== id) });
    },

    deleteAlbum: (id) => {
      mutateWorkspace((ws) => ({ ...ws, albums: ws.albums.filter((a) => a.id !== id) }));
      if (get().openAlbumId === id) set({ openAlbumId: null });
    },

    addTracks: (albumId, paths) =>
      mutateAlbum(albumId, (a) => ({
        ...a,
        trackPaths: [...a.trackPaths, ...paths.filter((p) => !a.trackPaths.includes(p))],
      })),

    removeTrack: (albumId, path) =>
      mutateAlbum(albumId, (a) => ({ ...a, trackPaths: a.trackPaths.filter((p) => p !== path) })),

    moveTrack: (albumId, from, to) =>
      mutateAlbum(albumId, (a) => {
        if (to < 0 || to >= a.trackPaths.length) return a;
        const tracks = [...a.trackPaths];
        const [moved] = tracks.splice(from, 1);
        tracks.splice(to, 0, moved);
        return { ...a, trackPaths: tracks };
      }),

    createProject: async ({ name, templatePath, parentFolder, albumId, status }) => {
      const path = await api.createProject({ templatePath, parentFolder, name });
      get().updateSong(path, { status });
      if (albumId) get().addTracks(albumId, [path]);
      await get().rescan();
      return path;
    },

    duplicateProject: async (path, newName) => {
      const created = await api.duplicateProject(path, newName);
      // The new version inherits the song's tags and status.
      const meta = get().workspace.songs[path];
      if (meta) get().updateSong(created, { ...meta });
      await get().rescan();
      return created;
    },

    restoreBackup: async (backupPath, projectPath) => {
      const created = await api.restoreBackup(backupPath, projectPath);
      await get().rescan();
      return created;
    },

    trashBackups: async (paths) => {
      const count = await api.trashBackups(paths);
      await get().rescan();
      return count;
    },
  };
});
