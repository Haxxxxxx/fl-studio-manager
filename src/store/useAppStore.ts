import { create } from "zustand";
import * as api from "../lib/tauri";
import { generateSampleProjects } from "../lib/sampleData";
import type { ProjectInfo, RenderEvent, RenderStatus, Settings } from "../types";

const DEFAULT_SETTINGS: Settings = {
  watchedFolders: [],
  flStudioPath: null,
  outputFolder: null,
  renderFormat: "wav",
  favorites: [],
};

export type View = "dashboard" | "library" | "settings";
export type SortKey = "modified" | "name" | "size" | "genre" | "tempo";
export type SortDir = "asc" | "desc";

interface RenderJob {
  status: RenderStatus;
  message: string | null;
  outputPath: string | null;
}

interface AppState {
  view: View;
  settings: Settings;
  settingsLoaded: boolean;
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
  folderFilter: string | null;
  genreFilter: string | null;
  favoritesOnly: boolean;

  setView: (view: View) => void;
  setSearch: (search: string) => void;
  init: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addWatchedFolder: () => Promise<void>;
  removeWatchedFolder: (folder: string) => Promise<void>;
  rescan: () => Promise<void>;
  toggleSelected: (path: string) => void;
  selectAll: (paths: string[]) => void;
  clearSelection: () => void;
  startRender: () => Promise<void>;
  dismissRenderPanel: () => void;
  loadDemoData: () => void;
  exitDemoMode: () => Promise<void>;
  toggleFavorite: (path: string) => void;
  setSort: (key: SortKey) => void;
  setFolderFilter: (folder: string | null) => void;
  setGenreFilter: (genre: string | null) => void;
  setFavoritesOnly: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: "dashboard",
  settings: DEFAULT_SETTINGS,
  settingsLoaded: false,
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
  folderFilter: null,
  genreFilter: null,
  favoritesOnly: false,

  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),

  init: async () => {
    const settings = await api.getSettings();
    set({ settings, settingsLoaded: true });

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
      await get().rescan();
    }
  },

  updateSettings: async (patch) => {
    const merged = { ...get().settings, ...patch };
    set({ settings: merged });
    await api.saveSettings(merged);
  },

  addWatchedFolder: async () => {
    const folder = await api.pickFolder();
    if (!folder) return;
    const current = get().settings;
    if (current.watchedFolders.includes(folder)) return;
    set({ demoMode: false });
    await get().updateSettings({
      watchedFolders: [...current.watchedFolders, folder],
    });
    await get().rescan();
  },

  removeWatchedFolder: async (folder) => {
    const current = get().settings;
    await get().updateSettings({
      watchedFolders: current.watchedFolders.filter((f) => f !== folder),
    });
    await get().rescan();
  },

  rescan: async () => {
    if (get().demoMode) return;
    const folders = get().settings.watchedFolders;
    if (folders.length === 0) {
      set({ projects: [] });
      return;
    }
    set({ scanning: true });
    try {
      const projects = await api.scanProjects(folders);
      set({ projects });
    } finally {
      set({ scanning: false });
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

  startRender: async () => {
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
    const projectPaths = Array.from(selected);
    if (projectPaths.length === 0) return;

    const seedJobs = new Map(get().renderJobs);
    for (const path of projectPaths) {
      seedJobs.set(path, { status: "queued", message: null, outputPath: null });
    }
    set({ renderJobs: seedJobs, rendering: true });

    try {
      await api.renderProjects({
        projectPaths,
        outputFolder: settings.outputFolder,
        flStudioPath: settings.flStudioPath,
        format: settings.renderFormat,
      });
    } finally {
      set({ rendering: false });
    }
  },

  dismissRenderPanel: () => set({ renderJobs: new Map() }),

  loadDemoData: () => {
    set({
      demoMode: true,
      projects: generateSampleProjects(),
      selected: new Set(),
      view: "dashboard",
    });
  },

  exitDemoMode: async () => {
    set({ demoMode: false, selected: new Set() });
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

  setFolderFilter: (folder) => set({ folderFilter: folder }),
  setGenreFilter: (genre) => set({ genreFilter: genre }),
  setFavoritesOnly: (value) => set({ favoritesOnly: value }),
}));
