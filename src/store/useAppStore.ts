import { create } from "zustand";
import * as api from "../lib/tauri";
import { generateSampleProjects, generateSampleWorkspace } from "../lib/sampleData";
import { ALBUM_COLORS, EMPTY_WORKSPACE, migrateWorkspace, newId } from "../lib/songs";
import { addColumn, moveCard, moveColumn, removeColumn, renameColumn } from "../lib/pipeline";
import { applyRelinks, findRelinks, type Relink } from "../lib/relink";
import { canRenderInApp, dawOf, splitRenderable } from "../lib/daws";
import type {
  DetectedFolder,
  CaptionLang,
  PackagePlan,
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
  aiIncludeNotes: false,
  captionLanguage: "fr",
  ffmpegPath: null,
};

export type View =
  | "dashboard"
  | "library"
  | "pipeline"
  | "albums"
  | "people"
  | "launch"
  | "calendar"
  | "settings"
  // The crew section of the menu (CrewSection).
  | "crewBoard"
  | "crewReleases"
  | "crewMembers"
  | "crewSettings";
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
  /** The last workspace save failed (cleared by the next successful save). */
  saveError: string | null;
  dismissErrors: () => void;
  /** FL's default projects folder when found and nothing is linked yet. */
  /** DAW default folders found on this computer; null = not looked yet. */
  detectedFolders: DetectedFolder[] | null;
  workspace: Workspace;
  /** False if the stored workspace couldn't be read — see loadWorkspace. */
  workspaceWritable: boolean;
  projects: ProjectInfo[];
  scanning: boolean;
  /** Songs whose record followed a rename/move in the last scan (shown once). */
  relinked: Relink[];
  dismissRelinked: () => void;
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
  /** Files each package would hold, waiting for the user to confirm. */
  packagePlan: { plans: PackagePlan[]; subfolder?: string; skipped: PackageResult[] } | null;
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
/** Preferences only: paths go through the pickers below (Rust owns them). */
  updateSettings: (patch: Partial<Omit<Settings, "watchedFolders" | "flStudioPath" | "outputFolder" | "ffmpegPath">>) => Promise<void>;
  /** Native picker (in Rust); links the folder and scans it. */
  addWatchedFolder: () => Promise<void>;
  /** Look for every DAW's default projects folder (never links anything). */
  detectFolders: () => Promise<void>;
  /** Link one detected folder (the user confirmed it) and scan it. */
  linkDetected: (path: string) => Promise<void>;
  removeWatchedFolder: (folder: string) => Promise<void>;
  pickOutputFolder: () => Promise<void>;
  pickFlStudio: () => Promise<void>;
  /** Fill in the FL Studio found on this machine; false if none was found. */
  detectFlStudio: () => Promise<boolean>;
  pickFfmpeg: () => Promise<void>;
  clearPathSetting: (which: "flStudio" | "ffmpeg" | "outputFolder") => Promise<void>;
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
  /** Lists what each package would hold (packagePlan); nothing is written yet. */
  startPackage: (paths: string[], subfolder?: string) => Promise<void>;
  /** Zip the confirmed files into `<export folder>/Packages[/subfolder]`. */
  confirmPackage: (approved: string[][]) => Promise<void>;
  cancelPackage: () => void;
  dismissPackageResults: () => void;
  setFavoritesOnly: (value: boolean) => void;
  setShowTemplates: (value: boolean) => void;
  openDetail: (path: string | null) => void;
  openAlbum: (id: string | null) => void;
  openPerson: (id: string | null) => void;
  openLaunchKit: (path: string | null) => void;
  /** undefined resets the field to its generated value. */
  setKitEdit: (path: string, id: KitFieldId, value: string | undefined) => void;
  /** Several fields at once; null clears every edit (back to generated). */
  setKitEdits: (path: string, edits: Partial<Record<KitFieldId, string>> | null) => void;
  setSnippetStart: (path: string, label: string, startSec: number | undefined) => void;
  /** Change a snippet's length (undefined = back to the detected length). */
  setSnippetLength: (path: string, label: string, lengthSec: number | undefined) => void;
  acceptKit: (path: string) => void;
  /** Merge AI drafts/review into a song's kit. */
  setKitAi: (path: string, patch: Partial<KitAiMeta>) => void;
  /** null until loaded; whether a Gemini key is set. */
  aiStatus: AiStatus | null;
  refreshAiStatus: () => Promise<void>;
  /** Set or clear the picked cover concept (metadata only). */
  setKitCover: (path: string, cover: KitCoverMeta | undefined) => void;
  /** This kit's caption language; undefined = the one in Settings. */
  setKitCaptionLanguage: (path: string, lang: CaptionLang | undefined) => void;
  /** null until loaded; whether Cloudflare credentials are set. */
  coverStatus: CoverStatus | null;
  refreshCoverStatus: () => Promise<void>;
  openNewProject: (draft?: Partial<NewProjectDraft>) => void;
  closeNewProject: () => void;

  // Song metadata
  updateSong: (path: string, patch: Partial<SongMeta>) => void;
  setStatus: (paths: string[], status: SongStatus | undefined) => void;

  // Pipeline columns (src/lib/pipeline.ts; shared by board, list and table)
  renamePipelineColumn: (id: string, name: string) => void;
  addPipelineColumn: (name: string, stage: SongStatus | null) => void;
  removePipelineColumn: (id: string) => void;
  movePipelineColumn: (id: string, toIndex: number) => void;
  /** `songs` = the songs on the board (for the column's current order). */
  movePipelineCard: (songs: ProjectInfo[], path: string, columnId: string, beforePath: string | null) => void;

  // Albums
  createAlbum: (title: string) => string;
  updateAlbum: (id: string, patch: Partial<Omit<Album, "id">>) => void;
  deleteAlbum: (id: string) => void;
  /** Crew sync: forget deleted-release markers once their rows are gone. */
  clearDeletedReleaseShares: (ids: string[]) => void;

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
  trashBackups: (paths: string[], allowPermanent?: boolean) => Promise<number>;
}

/** Flush a pending debounced workspace save (set once the store exists). */
let flushPending: () => Promise<void> = () => Promise.resolve();
export const flushWorkspace = () => flushPending();

/** The workspace save currently being written, if any. */
let savingNow: Promise<void> | null = null;
/** The real favorites while sample data is shown (sample stars stay in memory). */
let realFavorites: string[] | null = null;
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
    saveTimer = setTimeout(() => void persistWorkspace(), 400);
  }

  /** Write the workspace now (the debounced save, or a flush on close). */
  async function persistWorkspace() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    // Re-check at fire time: sample data may have been loaded meanwhile.
    if (get().demoMode || !get().workspaceWritable) return;
    const write = api
      .saveWorkspace(get().workspace)
      .then(() => {
        if (get().saveError) set({ saveError: null });
      })
      .catch((e) => {
        console.error("saving workspace failed", e);
        set({ saveError: `Couldn't save your changes (stages, notes, releases): ${String(e)}` });
      });
    savingNow = write;
    await write;
    if (savingNow === write) savingNow = null;
  }
  // On close: write a pending save, or wait for the one being written.
  flushPending = async () => {
    if (saveTimer) await persistWorkspace();
    else if (savingNow) await savingNow;
  };

  /** Leaving sample data: put the real favorites back. */
  function restoreRealFavorites() {
    if (realFavorites) set({ settings: { ...get().settings, favorites: realFavorites } });
    realFavorites = null;
  }

  /** Rescan after a folder change; a failure shows in the error banner
   * (these run from buttons, so nobody else would catch it). */
  /** Take the path settings Rust saved; keep this session's other preferences
   * (sample-data favorites stay in memory). */
  function keepPaths(saved: Settings) {
    const { watchedFolders, flStudioPath, outputFolder, ffmpegPath } = saved;
    set((s) => ({ settings: { ...s.settings, watchedFolders, flStudioPath, outputFolder, ffmpegPath } }));
  }

  /** A folder was linked: leave sample data if needed, then scan. */
  async function linked(saved: Settings) {
    // Leaving sample data: drop its fake albums/people before anything
    // can be saved over the real workspace.
    if (get().demoMode) {
      set({ demoMode: false, projects: [], selected: new Set(), detailPath: null, openAlbumId: null });
      restoreRealFavorites();
      await loadWorkspace();
    }
    keepPaths(saved);
    await scanOrReport();
  }

  function scanOrReport() {
    return get()
      .rescan()
      .then(() => {
        if (get().startupError?.startsWith("Scanning failed")) set({ startupError: null });
      })
      .catch((e) => set({ startupError: `Scanning failed: ${String(e)}` }));
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
      const { workspace, changed } = stored ? migrateWorkspace(stored) : { workspace: EMPTY_WORKSPACE, changed: false };
      set({ workspace, workspaceWritable: true });
      // Save the upgraded shape once, so the migration doesn't rerun.
      if (changed) await api.saveWorkspace(workspace).catch((e) => console.error("saving migrated workspace failed", e));
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
    saveError: null,
    dismissErrors: () => set({ startupError: null, saveError: null }),
    detectedFolders: null,
    workspace: EMPTY_WORKSPACE,
    workspaceWritable: false,
    projects: [],
    scanning: false,
    relinked: [],
    dismissRelinked: () => set({ relinked: [] }),
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
    packagePlan: null,
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
        settings = (await api.useDetectedFlStudio().catch(() => null)) ?? settings;
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
        // Fresh machine: propose every DAW folder found (the user links them).
        await get().detectFolders();
      }
    },

    updateSettings: async (patch) => {
      const merged = { ...get().settings, ...patch };
      set({ settings: merged });
      // Sample-data stars never reach settings.json.
      await api.saveSettings(realFavorites ? { ...merged, favorites: realFavorites } : merged);
    },

    addWatchedFolder: async () => {
      const before = get().settings.watchedFolders;
      const next = await api.pickWatchedFolder();
      if (next.watchedFolders.length !== before.length) await linked(next);
    },

    detectFolders: async () => {
      set({ detectedFolders: await api.detectDawFolders().catch(() => []) });
    },

    linkDetected: async (path) => {
      await linked(await api.linkDetectedFolder(path));
      set((s) => ({ detectedFolders: s.detectedFolders?.map((f) => (f.path === path ? { ...f, linked: true } : f)) ?? null }));
    },

    removeWatchedFolder: async (folder) => {
      const next = await api.removeWatchedFolder(folder);
      keepPaths(next);
      await scanOrReport();
      // Unlinking a detected folder makes it a proposal again.
      await get().detectFolders();
    },

    pickOutputFolder: async () => {
      const before = get().settings.outputFolder;
      const next = await api.pickOutputFolder();
      keepPaths(next);
      if (next.outputFolder !== before) await get().rescan();
    },

    pickFlStudio: async () => keepPaths(await api.pickFlStudio()),

    detectFlStudio: async () => {
      const next = await api.useDetectedFlStudio().catch(() => null);
      if (next) keepPaths(next);
      return !!next?.flStudioPath;
    },

    pickFfmpeg: async () => keepPaths(await api.pickFfmpeg()),

    clearPathSetting: async (which) => {
      keepPaths(await api.clearPathSetting(which));
      if (which === "outputFolder") await get().rescan();
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
        const projects = await api.scanProjects();
        if (id === scanSeq && !get().demoMode) {
          // Renamed/moved .flp files keep their stage, tags, notes, credits,
          // crew share and album slot (lib/relink.ts). Only on the real,
          // writable workspace, never sample data.
          const relinks = get().workspaceWritable ? findRelinks(projects, get().workspace, folders) : [];
          if (relinks.length) {
            const map = new Map(relinks.map((r) => [r.from, r.to]));
            mutateWorkspace((ws) => applyRelinks(ws, relinks));
            const favs = get().settings.favorites;
            if (favs.some((f) => map.has(f))) void get().updateSettings({ favorites: favs.map((f) => map.get(f) ?? f) });
            const open = get().detailPath;
            set({ relinked: [...get().relinked, ...relinks], detailPath: open && map.has(open) ? map.get(open)! : open });
          }
          set({ projects });
        }
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
      const requested = paths ?? Array.from(selected);
      if (requested.length === 0) return;
      if (get().rendering) throw new Error("An export is already running.");
      // Rendering from the app drives FL Studio; other DAWs' songs are
      // listed as skipped with where to export them instead.
      const byPath = new Map(get().projects.map((p) => [p.path, p]));
      const { paths: projectPaths, names: outputNames, skipped } = splitRenderable(requested, byPath, options?.names);
      if (projectPaths.length === 0) {
        const daw = dawOf(byPath.get(requested[0]) ?? {});
        throw new Error(`Rendering from Hivo works with FL Studio projects. Export this one from ${daw.label}: ${daw.exportTip}`);
      }


      const seedJobs = new Map(get().renderJobs);
      for (const path of projectPaths) {
        seedJobs.set(path, { status: "queued", message: null, outputPath: null });
      }
      for (const path of skipped) {
        const daw = dawOf(byPath.get(path) ?? {});
        seedJobs.set(path, { status: "error", message: `Not an FL Studio project. Export it from ${daw.label}.`, outputPath: null });
      }
      set({ renderJobs: seedJobs, rendering: true });

      try {
        // FL Studio, the format and the export folder are read from Settings in Rust.
        await api.renderProjects({ projectPaths, subfolder: options?.subfolder, outputNames });
      } catch (e) {
        // Failed before (or while) FL Studio reported progress: mark the rows
        // that never finished, so the panel doesn't read "complete".
        const jobs = new Map(get().renderJobs);
        for (const path of projectPaths) {
          const job = jobs.get(path);
          if (job && (job.status === "queued" || job.status === "rendering")) jobs.set(path, { ...job, status: "error", message: String(e) });
        }
        set({ renderJobs: jobs });
        throw e;
      } finally {
        set({ rendering: false });
        // Pick up the new mixdowns (freshness badges, playback).
        get().rescan().catch(() => {});
      }
    },

    dismissRenderPanel: () => set({ renderJobs: new Map() }),

    loadDemoData: () => {
      // Flush a pending real save now, before the workspace is swapped.
      // (persistWorkspace reads the workspace synchronously, before the swap.)
      if (saveTimer) void persistWorkspace();
      realFavorites ??= get().settings.favorites;
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
      restoreRealFavorites();
      await loadWorkspace();
      await get().rescan();
    },

    toggleFavorite: (path) => {
      const current = get().settings;
      const isFavorite = current.favorites.includes(path);
      const favorites = isFavorite
        ? current.favorites.filter((p) => p !== path)
        : [...current.favorites, path];
      // Sample songs have fake paths: keep their stars out of settings.json.
      if (get().demoMode) set({ settings: { ...current, favorites } });
      else void get().updateSettings({ favorites });
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
      // Packages are FL's flat .flp + samples zips; other DAWs are reported as skipped.
      const byPath = new Map(get().projects.map((p) => [p.path, p]));
      const skippedResults = paths
        .filter((p) => !canRenderInApp(byPath.get(p) ?? {}))
        .map((p) => ({
          projectPath: p,
          zipPath: null,
          bytes: 0,
          included: 0,
          missing: [],
          error: `Packaging works with FL Studio projects. In ${dawOf(byPath.get(p) ?? {}).label}, use its own "collect and save" feature.`,
        }));
      paths = paths.filter((p) => canRenderInApp(byPath.get(p) ?? {}));
      if (paths.length === 0) {
        set({ packageResults: skippedResults });
        throw new Error(skippedResults[0]?.error ?? "Nothing to package.");
      }
      const plans = await api.packagePreview(paths);
      set({ packagePlan: { plans, subfolder, skipped: skippedResults }, packageResults: null });
    },

    cancelPackage: () => set({ packagePlan: null }),

    confirmPackage: async (approved) => {
      const { settings, packaging, packagePlan } = get();
      if (!packagePlan || packaging || !settings.outputFolder) return;
      const { plans, subfolder, skipped: skippedResults } = packagePlan;
      const paths = plans.map((p) => p.projectPath);
      set({ packaging: true, packageResults: skippedResults, packagePlan: null });
      // Results stream in per song so the panel can show progress.
      const unlisten = await api.onPackageProgress((r) =>
        set((s) => ({ packageResults: [...(s.packageResults ?? []), r] })),
      );
      try {
        await api.packageProjects({ projectPaths: paths, subfolder, approved });
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

    setSnippetLength: (path, label, lengthSec) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      const snippetLengths = { ...kit.snippetLengths };
      if (lengthSec === undefined) delete snippetLengths[label];
      else snippetLengths[label] = lengthSec;
      get().updateSong(path, { launchKit: { ...kit, snippetLengths, acceptedAtMs: undefined } });
    },

    setKitEdits: (path, edits) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      get().updateSong(path, { launchKit: { ...kit, edits: edits === null ? {} : { ...kit.edits, ...edits }, acceptedAtMs: undefined } });
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
      const aiStatus = await api.aiStatus().catch(() => null);
      set({ aiStatus });
    },
    setKitCover: (path, cover) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      get().updateSong(path, { launchKit: { ...kit, cover } });
    },
    setKitCaptionLanguage: (path, captionLanguage) => {
      const kit = get().workspace.songs[path]?.launchKit ?? {};
      get().updateSong(path, { launchKit: { ...kit, captionLanguage, acceptedAtMs: undefined } });
    },
    coverStatus: null,
    refreshCoverStatus: async () => {
      const coverStatus = await api.coverStatus().catch(() => null);
      set({ coverStatus });
    },
    openNewProject: (draft) =>
      set({ newProject: { albumId: null, status: "creation", ...draft } }),
    closeNewProject: () => set({ newProject: null }),

    updateSong: (path, patch) =>
      mutateWorkspace((ws) => {
        // A local stage change waits to be sent to the crew (crew sync
        // sends it with the version it was made on). Crew moves applied here
        // carry their own sync fields.
        const stamped: Partial<SongMeta> =
          "status" in patch && patch.stagePending === undefined ? { ...patch, stageUpdatedAtMs: Date.now(), stagePending: true } : { ...patch };
        // A new stage from anywhere but the board drops the column pin.
        if ("status" in patch && !("column" in patch) && patch.status !== ws.songs[path]?.status) stamped.column = undefined;
        return { ...ws, songs: { ...ws.songs, [path]: { ...ws.songs[path], ...stamped } } };
      }),

    renamePipelineColumn: (id, name) => mutateWorkspace((ws) => renameColumn(ws, id, name)),
    addPipelineColumn: (name, stage) => mutateWorkspace((ws) => addColumn(ws, name, stage)),
    removePipelineColumn: (id) => mutateWorkspace((ws) => removeColumn(ws, id)),
    movePipelineColumn: (id, toIndex) => mutateWorkspace((ws) => moveColumn(ws, id, toIndex)),
    movePipelineCard: (songs, path, columnId, beforePath) => mutateWorkspace((ws) => moveCard(ws, songs, path, columnId, beforePath)),

    setStatus: (paths, status) =>
      mutateWorkspace((ws) => {
        const songs = { ...ws.songs };
        const now = Date.now();
        for (const p of paths) songs[p] = { ...songs[p], status, column: songs[p]?.column && songs[p]?.status === status ? songs[p].column : undefined, stageUpdatedAtMs: now, stagePending: true };
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
      mutateWorkspace((ws) => {
        const gone = ws.albums.find((a) => a.id === id);
        // Shared: remember it, so the crew sync deletes its row too.
        const tomb =
          gone?.shareId && gone.shared !== false && gone.shareCrewId && gone.shareUserId
            ? [...(ws.deletedReleaseShares ?? []), { id: gone.shareId, crewId: gone.shareCrewId, userId: gone.shareUserId }]
            : ws.deletedReleaseShares;
        return { ...ws, albums: ws.albums.filter((a) => a.id !== id), deletedReleaseShares: tomb };
      });
      if (get().openAlbumId === id) set({ openAlbumId: null });
    },

    clearDeletedReleaseShares: (ids) =>
      mutateWorkspace((ws) => ({ ...ws, deletedReleaseShares: (ws.deletedReleaseShares ?? []).filter((d) => !ids.includes(d.id)) })),

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
      // The new version inherits the song's tags and stage only: not its
      // crew share (one share id per song), Launch Kit, credits or archive flag.
      const meta = get().workspace.songs[path];
      if (meta) get().updateSong(created, { tags: meta.tags, status: meta.status });
      await get().rescan();
      return created;
    },

    restoreBackup: async (backupPath, projectPath) => {
      const created = await api.restoreBackup(backupPath, projectPath);
      await get().rescan();
      return created;
    },

    trashBackups: async (paths, allowPermanent) => {
      const count = await api.trashBackups(paths, allowPermanent);
      await get().rescan();
      return count;
    },
  };
});
