import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { crewErrorMessage, supabase } from "../lib/supabase";
import { remoteStageMoves, sharedPayloads, staleShareIds } from "../lib/crewSync";
import type { CrewMemberRow, CrewSongRow, CrewSummary, SongStatus } from "../types";
import { useAppStore } from "./useAppStore";

// The crew side of the app (docs/ARCHITECTURE.md): sign-in, crews, the
// crew's shared songs, and sync with the local workspace. Off entirely when
// no Supabase project is configured, and never active on sample data.

const ACTIVE_CREW_KEY = "flm-active-crew";
const PUSH_DELAY_MS = 1500;

type SyncState = { kind: "idle" } | { kind: "syncing" } | { kind: "synced"; atMs: number } | { kind: "error"; message: string };

interface CrewState {
  enabled: boolean;
  ready: boolean;
  userId: string | null;
  email: string | null;
  crews: CrewSummary[];
  activeCrewId: string | null;
  members: CrewMemberRow[];
  songs: CrewSongRow[];
  invite: string | null;
  sync: SyncState;

  init: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadCrews: () => Promise<void>;
  selectCrew: (id: string | null) => Promise<void>;
  createCrew: (name: string, displayName: string) => Promise<void>;
  joinCrew: (code: string, displayName: string) => Promise<void>;
  createInvite: () => Promise<string>;
  leaveCrew: () => Promise<void>;
  /** Share or stop sharing songs with the active crew. */
  setShared: (paths: string[], shared: boolean) => void;
  /** Move any crew song on the shared board. */
  moveCrewSong: (songId: string, stage: SongStatus | null) => Promise<void>;
  syncNow: () => Promise<void>;
}

let initialized = false;
let channel: RealtimeChannel | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Last payload pushed per song id, so unchanged songs aren't re-sent. */
const lastPushed = new Map<string, string>();

/** RFC 4122 v4 (the database id type), with a fallback for old webviews. */
function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readActiveCrew(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CREW_KEY);
  } catch {
    return null;
  }
}

function writeActiveCrew(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_CREW_KEY, id);
    else localStorage.removeItem(ACTIVE_CREW_KEY);
  } catch {
    /* per-device convenience only */
  }
}

export const useCrewStore = create<CrewState>((set, get) => {
  /** Signed in, a crew chosen, real data (not sample data). */
  const canSync = () => !!supabase && !!get().userId && !!get().activeCrewId && !useAppStore.getState().demoMode;

  async function loadCrewData() {
    const crewId = get().activeCrewId;
    if (!supabase || !crewId) return set({ songs: [], members: [] });
    const [songs, members] = await Promise.all([
      supabase.from("songs").select("*").eq("crew_id", crewId).order("updated_at", { ascending: false }),
      supabase.from("crew_members").select("*").eq("crew_id", crewId).order("joined_at"),
    ]);
    if (songs.error) throw songs.error;
    if (members.error) throw members.error;
    set({ songs: songs.data as CrewSongRow[], members: members.data as CrewMemberRow[] });
  }

  /** Apply stage moves made on the crew board to my local songs. */
  function applyRemoteMoves() {
    const uid = get().userId;
    if (!uid || useAppStore.getState().demoMode) return;
    const app = useAppStore.getState();
    for (const m of remoteStageMoves(get().songs, app.workspace, uid)) {
      app.updateSong(m.path, { status: m.stage, stageUpdatedAtMs: m.atMs });
    }
  }

  function subscribe(crewId: string | null) {
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
    if (!supabase || !crewId) return;
    channel = supabase
      .channel(`crew:${crewId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "songs", filter: `crew_id=eq.${crewId}` }, (payload) => {
        const songs = get().songs.filter((s) => s.id !== ((payload.old as { id?: string })?.id ?? (payload.new as { id?: string })?.id));
        if (payload.eventType !== "DELETE") songs.unshift(payload.new as CrewSongRow);
        set({ songs });
        applyRemoteMoves();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crew_members", filter: `crew_id=eq.${crewId}` }, () => {
        void loadCrewData().catch(() => {});
      })
      .subscribe();
  }

  async function push() {
    if (!supabase || !canSync()) return;
    const crewId = get().activeCrewId!;
    const uid = get().userId!;
    const { projects, workspace } = useAppStore.getState();
    const rows = sharedPayloads(projects, workspace, crewId).filter((r) => lastPushed.get(r.id) !== JSON.stringify(r));
    if (rows.length) {
      const { error } = await supabase.from("songs").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      for (const r of rows) lastPushed.set(r.id, JSON.stringify(r));
    }
    const stale = staleShareIds(get().songs, workspace, uid);
    if (stale.length) {
      const { error } = await supabase.from("songs").delete().in("id", stale);
      if (error) throw error;
      stale.forEach((id) => lastPushed.delete(id));
    }
  }

  async function run(fn: () => Promise<void>) {
    set({ sync: { kind: "syncing" } });
    try {
      await fn();
      set({ sync: { kind: "synced", atMs: Date.now() } });
    } catch (e) {
      set({ sync: { kind: "error", message: crewErrorMessage(e) } });
      throw e;
    }
  }

  return {
    enabled: !!supabase,
    ready: false,
    userId: null,
    email: null,
    crews: [],
    activeCrewId: null,
    members: [],
    songs: [],
    invite: null,
    sync: { kind: "idle" },

    init: async () => {
      // Once per app run (React runs startup effects twice in development).
      if (initialized) return;
      initialized = true;
      if (!supabase) return set({ ready: true });
      const { data } = await supabase.auth.getSession();
      set({ userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null, ready: true });
      supabase.auth.onAuthStateChange((_event, session) => {
        const userId = session?.user.id ?? null;
        if (userId === get().userId) return;
        lastPushed.clear();
        set({ userId, email: session?.user.email ?? null, crews: [], activeCrewId: null, songs: [], members: [], invite: null });
        if (userId) void get().loadCrews().catch(() => {});
        else subscribe(null);
      });
      if (get().userId) await get().loadCrews().catch(() => {});
      // Push shortly after local changes (statuses, tags, a new scan…).
      useAppStore.subscribe((state, prev) => {
        if (state.workspace === prev.workspace && state.projects === prev.projects) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          if (canSync()) void run(push).catch(() => {});
        }, PUSH_DELAY_MS);
      });
    },

    sendCode: async (email) => {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (error) throw new Error(crewErrorMessage(error));
    },

    verifyCode: async (email, code) => {
      if (!supabase) return;
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (error) throw new Error(crewErrorMessage(error));
    },

    signOut: async () => {
      if (!supabase) return;
      subscribe(null);
      writeActiveCrew(null);
      await supabase.auth.signOut();
    },

    loadCrews: async () => {
      if (!supabase || !get().userId) return;
      const { data, error } = await supabase
        .from("crew_members")
        .select("crew_id, role, display_name, crews(name)")
        .eq("user_id", get().userId!);
      if (error) throw new Error(crewErrorMessage(error));
      const crews: CrewSummary[] = (data ?? []).map((r) => ({
        id: r.crew_id as string,
        name: ((r.crews as unknown as { name: string } | null)?.name ?? "Crew") as string,
        role: r.role as CrewSummary["role"],
        displayName: r.display_name as string,
      }));
      set({ crews });
      const remembered = readActiveCrew();
      const pick = crews.find((c) => c.id === remembered)?.id ?? crews[0]?.id ?? null;
      await get().selectCrew(pick);
    },

    selectCrew: async (id) => {
      writeActiveCrew(id);
      lastPushed.clear();
      set({ activeCrewId: id, invite: null, songs: [], members: [] });
      subscribe(id);
      if (id) {
        await run(async () => {
          await loadCrewData();
          applyRemoteMoves();
          await push();
        }).catch(() => {});
      }
    },

    createCrew: async (name, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("create_crew", { p_name: name, p_display_name: displayName });
      if (error) throw new Error(crewErrorMessage(error));
      writeActiveCrew(data as string);
      await get().loadCrews();
    },

    joinCrew: async (code, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("join_crew", { p_code: code, p_display_name: displayName });
      if (error) throw new Error(crewErrorMessage(error));
      writeActiveCrew(data as string);
      await get().loadCrews();
    },

    createInvite: async () => {
      if (!supabase || !get().activeCrewId) throw new Error("Choose a crew first.");
      const { data, error } = await supabase.rpc("create_invite", { p_crew: get().activeCrewId, p_max_uses: 10 });
      if (error) throw new Error(crewErrorMessage(error));
      set({ invite: data as string });
      return data as string;
    },

    leaveCrew: async () => {
      const { activeCrewId, userId } = get();
      if (!supabase || !activeCrewId || !userId) return;
      const { error } = await supabase.from("crew_members").delete().eq("crew_id", activeCrewId).eq("user_id", userId);
      if (error) throw new Error(crewErrorMessage(error));
      writeActiveCrew(null);
      await get().loadCrews();
    },

    setShared: (paths, shared) => {
      const app = useAppStore.getState();
      for (const path of paths) {
        const meta = app.workspace.songs[path] ?? {};
        app.updateSong(path, { shared, shareId: meta.shareId ?? uuid() });
      }
    },

    moveCrewSong: async (songId, stage) => {
      if (!supabase) return;
      const before = get().songs;
      set({ songs: before.map((s) => (s.id === songId ? { ...s, stage, stage_updated_at: new Date().toISOString() } : s)) });
      const { error } = await supabase.rpc("set_song_stage", { p_song: songId, p_stage: stage });
      if (error) {
        set({ songs: before });
        throw new Error(crewErrorMessage(error));
      }
      applyRemoteMoves();
    },

    syncNow: async () => {
      if (!canSync()) return;
      await run(async () => {
        await push();
        await loadCrewData();
        applyRemoteMoves();
      });
    },
  };
});
