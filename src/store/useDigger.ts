import { create } from "zustand";
import * as api from "../lib/tauri";
import { deeperExclude, foundTitles, leadHash, likedTitles, searchesDone, toggleLiked, type Liked } from "../lib/digger";
import { useAppStore } from "./useAppStore";
import type { BeatFile, DigResult, Lead, SavedLead, WebLink, YoutubeVideo } from "../types";

// The Digger: raw beats from the beats folders, up to 5 picked to dig for
// similar ones (docs/GUARDRAILS.md: a deliberate addition for the Creation
// stage). Nothing here is saved: the beats live in their folders.

export const MAX_PICKS = 5;

/** One "Go deeper" round: web links (Google Search) or new YouTube searches (without it). */
export interface DeeperRound {
  links: WebLink[];
  queries: string[];
  /** The titles of the results the round was seeded from ("Use for next dig"). */
  seeds: string[];
}

/** One round's YouTube results: the search that ran and what it gave back. */
export interface RoundResults {
  query: string;
  videos: YoutubeVideo[];
}

/** `list` with `entry` at `round`, earlier rounds that never searched left empty. */
function withRound(list: RoundResults[], round: number, entry: RoundResults): RoundResults[] {
  const out = list.slice();
  while (out.length < round) out.push({ query: "", videos: [] });
  out[round] = entry;
  return out;
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
  /** The YouTube search box (DigResults): what was typed, whether a search runs. */
  webQuery: string;
  searching: boolean;
  searchError: string | null;
  /** The last search that answered (null before any search). */
  searchedFor: string | null;
  setWebQuery: (q: string) => void;
  /** Search YouTube; the results land in the round on screen (`shownRound`). */
  searchYoutube: (q: string) => Promise<void>;
  /** The round on screen: 0 is the dig, n is rounds[n - 1]. Back to the
   * latest whenever a dig or a round arrives. */
  shownRound: number;
  setShownRound: (round: number) => void;
  /** YouTube results per round, indexed like the breadcrumb: 0 is the dig's
   * first search, n is rounds[n - 1]'s, each updated by a manual search
   * while that round is shown. */
  roundResults: RoundResults[];
  /** Results picked for the next round to go closer to (max MAX_LIKED);
   * a new dig clears them. */
  liked: Liked[];
  toggleLiked: (id: string, title: string) => void;
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
  /** Leads saved in the beats folders' `_leads`: url hash (`leadHash`) → file path. */
  savedLeads: Map<string, string>;
  /** The same leads with their facts, newest first (the Saved prods tab). */
  leads: SavedLead[];
  loadLeads: () => Promise<void>;
  /** Writes the lead as a text file (Rust: leads.rs); its hash turns "Saved". */
  saveLead: (lead: Lead) => Promise<void>;
  /** Deletes one lead file. */
  deleteLead: (path: string) => Promise<void>;
  leadError: string | null;
  /** What the docked YouTube player (DigResults) is on: results and saved
   * prods share it. */
  playing: Playing | null;
  setPlaying: (p: Playing | null) => void;
}

/** A checked YouTube ID and a title for the embedded player. */
export interface Playing {
  id: string;
  title: string;
}

/** A stable empty map: a fresh one in a selector re-renders forever. */
const NO_LEADS: Map<string, string> = new Map();
const NO_LEAD_LIST: SavedLead[] = [];

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
  searching: false,
  searchError: null,
  searchedFor: null,
  setWebQuery: (webQuery) => set({ webQuery }),
  searchYoutube: async (q) => {
    const query = q.trim();
    if (!query) return;
    // The results belong to the round on screen when the search started.
    const round = get().shownRound;
    set({ webQuery: query, searching: true, searchError: null });
    try {
      const videos = await api.youtubeSearch(query);
      // A slower, older search must not overwrite a newer one.
      if (get().webQuery === query) set({ searchedFor: query, roundResults: withRound(get().roundResults, round, { query, videos }) });
    } catch (e) {
      // The round keeps what it had; the error shows above it.
      if (get().webQuery === query) set({ searchedFor: null, searchError: e instanceof Error ? e.message : String(e) });
    } finally {
      if (get().webQuery === query) set({ searching: false });
    }
  },
  shownRound: 0,
  setShownRound: (shownRound) => set({ shownRound }),
  roundResults: [],
  liked: [],
  toggleLiked: (id, title) => set({ liked: toggleLiked(get().liked, id, title) }),
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
      // A fresh dig: no rounds, no per-round results, no picks, back to round 0.
      set({ dig, dugFor: picks, rounds: [], roundResults: [], liked: [], shownRound: 0, deeperError: null });
      markUnseen(set);
      // Start the first AI search right away (round 0's results); the others are one click.
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
    const { dig, rounds: before, roundResults, liked, diggingDeeper } = get();
    if (!dig || diggingDeeper) return;
    set({ diggingDeeper: true, deeperError: null });
    try {
      const links = before.map((r) => r.links);
      // Everything already on screen (every round's), so the new searches go elsewhere.
      const shown = foundTitles([...dig.web, ...links.flat()].map((l) => l.text).concat(roundResults.flatMap((r) => r.videos.map((v) => v.title))));
      // The picks steer the round: their titles go to both prompts as data.
      const seeds = likedTitles(liked);
      const round = await api.digDeeper(dig.analysis, deeperExclude(dig.web, links), shown, searchesDone(before), seeds, language);
      // A new dig meanwhile made this round about the wrong picks.
      if (get().dig !== dig) return;
      const brought = round.web.length > 0 || round.queries.length > 0;
      if (brought) {
        // The new round goes on screen, so its first search lands in it.
        const rounds = [...get().rounds, { links: round.web, queries: round.queries, seeds }];
        set({ rounds, shownRound: rounds.length });
      }
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
  savedLeads: NO_LEADS,
  leads: NO_LEAD_LIST,
  loadLeads: async () => {
    try {
      const saved = await api.listLeads();
      set({ savedLeads: new Map(saved.map((l) => [l.hash, l.path])), leads: saved });
    } catch {
      // No beats folder or nothing readable: nothing is saved, nothing to show.
      set({ savedLeads: NO_LEADS, leads: NO_LEAD_LIST });
    }
  },
  saveLead: async (lead) => {
    set({ leadError: null });
    try {
      const path = await api.saveLead(lead);
      set({ savedLeads: new Map(get().savedLeads).set(leadHash(lead.url), path) });
      // The list reads the file back (its date, the clipped facts).
      await get().loadLeads();
    } catch (e) {
      set({ leadError: e instanceof Error ? e.message : String(e) });
    }
  },
  deleteLead: async (path) => {
    set({ leadError: null });
    try {
      await api.deleteLead(path);
      await get().loadLeads();
    } catch (e) {
      set({ leadError: e instanceof Error ? e.message : String(e) });
    }
  },
  leadError: null,
  playing: null,
  setPlaying: (playing) => set({ playing }),
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
