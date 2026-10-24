import { create } from "zustand";
import * as api from "../lib/tauri";
import { deeperExclude, foundTitles, searchesDone } from "../lib/digger";
import { useAppStore } from "./useAppStore";
import type { BeatFile, DigResult, WebLink, YoutubeVideo } from "../types";

// The Digger: raw beats from the beats folders, up to 5 picked to dig for
// similar ones (docs/GUARDRAILS.md: a deliberate addition for the Creation
// stage). Nothing here is saved: the beats live in their folders.

export const MAX_PICKS = 5;

/** One "Go deeper" round: web links (Google Search) or new YouTube searches (without it). */
export interface DeeperRound {
  links: WebLink[];
  queries: string[];
}

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
  /** The web search (DigPanel): what was searched and what YouTube gave back. */
  webQuery: string;
  results: YoutubeVideo[];
  searching: boolean;
  searchError: string | null;
  /** The query the current `results` answer (null before any search). */
  searchedFor: string | null;
  setWebQuery: (q: string) => void;
  searchYoutube: (q: string) => Promise<void>;
  /** The AI dig over the picks (Rust: digger.rs). */
  dig: DigResult | null;
  /** The picks the current `dig` is about. */
  dugFor: string[];
  digging: boolean;
  digError: string | null;
  runDig: (language: "fr" | "en", youtube: boolean) => Promise<void>;
  /** "Go deeper" rounds after the dig, in order. */
  rounds: DeeperRound[];
  diggingDeeper: boolean;
  deeperError: string | null;
  runDeeper: (language: "fr" | "en", youtube: boolean) => Promise<void>;
  /** A dig or round finished while another view was open (Sidebar LED). */
  unseen: boolean;
  clearUnseen: () => void;
}

/** A dig finished: flag it unless the Digger is on screen. */
function markUnseen(set: (s: Partial<DiggerState>) => void) {
  if (useAppStore.getState().view !== "digger") set({ unseen: true });
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
  webQuery: "",
  results: [],
  searching: false,
  searchError: null,
  searchedFor: null,
  setWebQuery: (webQuery) => set({ webQuery }),
  searchYoutube: async (q) => {
    const query = q.trim();
    if (!query) return;
    set({ webQuery: query, searching: true, searchError: null });
    try {
      const results = await api.youtubeSearch(query);
      // A slower, older search must not overwrite a newer one.
      if (get().webQuery === query) set({ results, searchedFor: query });
    } catch (e) {
      if (get().webQuery === query) set({ results: [], searchedFor: null, searchError: e instanceof Error ? e.message : String(e) });
    } finally {
      if (get().webQuery === query) set({ searching: false });
    }
  },
  dig: null,
  dugFor: [],
  digging: false,
  digError: null,
  runDig: async (language, youtube) => {
    const picks = get().picked;
    if (!picks.length || get().digging) return;
    set({ digging: true, digError: null });
    try {
      const dig = await api.digBeats(picks, language);
      set({ dig, dugFor: picks, rounds: [], deeperError: null });
      markUnseen(set);
      // Start the first AI search right away; the others are one click.
      const first = dig.analysis.queries[0];
      if (first) {
        set({ webQuery: first });
        if (youtube) void get().searchYoutube(first);
      }
    } catch (e) {
      set({ digError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ digging: false });
    }
  },
  rounds: [],
  diggingDeeper: false,
  deeperError: null,
  runDeeper: async (language, youtube) => {
    const { dig, rounds, results, diggingDeeper } = get();
    if (!dig || diggingDeeper) return;
    set({ diggingDeeper: true, deeperError: null });
    try {
      const links = rounds.map((r) => r.links);
      // Everything already on screen, so the new searches go elsewhere.
      const shown = foundTitles([...dig.web, ...links.flat()].map((l) => l.text).concat(results.map((v) => v.title)));
      const round = await api.digDeeper(dig.analysis, deeperExclude(dig.web, links), shown, searchesDone(rounds), language);
      // A new dig meanwhile made this round about the wrong picks.
      if (get().dig !== dig) return;
      const brought = round.web.length > 0 || round.queries.length > 0;
      if (brought) set({ rounds: [...get().rounds, { links: round.web, queries: round.queries }] });
      if (round.webError) set({ deeperError: round.webError });
      // The menu dot means "something new to look at", not "a round ran".
      if (brought) markUnseen(set);
      // Same as runDig: the first new search runs right away.
      const first = round.queries[0];
      if (first) {
        set({ webQuery: first });
        if (youtube) void get().searchYoutube(first);
      }
    } catch (e) {
      set({ deeperError: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ diggingDeeper: false });
    }
  },
  unseen: false,
  clearUnseen: () => set({ unseen: false }),
}));

/** Whether the picks changed since the last dig. */
export function digIsStale(picked: string[], dugFor: string[]): boolean {
  return picked.length !== dugFor.length || picked.some((p) => !dugFor.includes(p));
}

/** Beats matching a search (name or folder), every word must match. */
export function filterBeats(beats: BeatFile[], query: string): BeatFile[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return beats;
  return beats.filter((b) => {
    const hay = `${b.name} ${b.folder}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
