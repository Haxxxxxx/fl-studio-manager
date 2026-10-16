import { create } from "zustand";
import * as api from "../lib/tauri";
import type { BeatFile } from "../types";

// The Digger: raw beats from the beats folders, up to 5 picked to dig for
// similar ones (docs/GUARDRAILS.md: a deliberate addition for the Creation
// stage). Nothing here is saved: the beats live in their folders.

export const MAX_PICKS = 5;

interface DiggerState {
  beats: BeatFile[];
  loading: boolean;
  error: string | null;
  /** Picked beat paths, in pick order (max MAX_PICKS). */
  picked: string[];
  query: string;
  load: () => Promise<void>;
  toggle: (path: string) => void;
  clearPicks: () => void;
  setQuery: (query: string) => void;
}

export const useDigger = create<DiggerState>((set, get) => ({
  beats: [],
  loading: false,
  error: null,
  picked: [],
  query: "",
  load: async () => {
    set({ loading: true, error: null });
    try {
      const beats = await api.scanBeats();
      const known = new Set(beats.map((b) => b.path));
      set({ beats, picked: get().picked.filter((p) => known.has(p)) });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ loading: false });
    }
  },
  toggle: (path) => {
    const picked = get().picked;
    if (picked.includes(path)) set({ picked: picked.filter((p) => p !== path) });
    else if (picked.length < MAX_PICKS) set({ picked: [...picked, path] });
  },
  clearPicks: () => set({ picked: [] }),
  setQuery: (query) => set({ query }),
}));

/** Beats matching a search (name or folder), every word must match. */
export function filterBeats(beats: BeatFile[], query: string): BeatFile[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return beats;
  return beats.filter((b) => {
    const hay = `${b.name} ${b.folder}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
