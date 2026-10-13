import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { crewErrorMessage, supabase } from "../lib/supabase";
import { localStageMoves, remoteStageMoves, sharedHere, sharedPayloads, staleShareIds, type ShareScope } from "../lib/crewSync";
import type { CrewMemberRow, CrewSongRow, CrewSummary, SongStatus } from "../types";
import { useAppStore } from "./useAppStore";

// The crew side of the app (docs/ARCHITECTURE.md): sign-in, crews, the
// crew's shared songs, and sync with the local workspace. Off entirely when
// no Supabase project is configured, and never active on sample data.
//
// Every sync is one cycle: pull the crew's rows, apply crewmates' stage moves
// locally, then push (see the rules in lib/crewSync.ts). Cycles never overlap;
// a change during a cycle queues one more. Cycles run on local changes
// (debounced), on crew switch, after realtime reconnects, and on focus/online.

const ACTIVE_CREW_KEY = "flm-active-crew";
const PUSH_DELAY_MS = 1500;
const RETRY_MS = 30_000;
const FOCUS_MIN_GAP_MS = 20_000;

type SyncState = { kind: "idle" } | { kind: "syncing" } | { kind: "synced"; atMs: number } | { kind: "error"; message: string };

interface CrewState {
  enabled: boolean;
  ready: boolean;
  userId: string | null;
  email: string | null;
  crews: CrewSummary[];
  /** Loading the crew list failed (so an empty list doesn't mean "no crews"). */
  loadError: string | null;
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
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let cycleRunning = false;
let cycleAgain = false;
let lastCycleMs = 0;
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
  const scope = (): ShareScope | null => {
    const { activeCrewId, userId } = get();
    return activeCrewId && userId ? { crewId: activeCrewId, userId } : null;
  };

  /** Signed in, a crew chosen, the real workspace loaded (never sample data,
   * never an empty stand-in after a failed load). */
  const canSync = () => {
    const app = useAppStore.getState();
    return !!supabase && !!scope() && !app.demoMode && app.settingsLoaded && app.workspaceWritable;
  };

  /** Fetch the active crew's rows. Returns false if the crew changed meanwhile
   * or I'm no longer a member (then the crew list is reloaded). */
  async function loadCrewData(): Promise<boolean> {
    const crewId = get().activeCrewId;
    if (!supabase || !crewId) {
      set({ songs: [], members: [] });
      return false;
    }
    const [songs, members] = await Promise.all([
      supabase.from("songs").select("*").eq("crew_id", crewId).order("updated_at", { ascending: false }),
      supabase.from("crew_members").select("*").eq("crew_id", crewId).order("joined_at"),
    ]);
    if (get().activeCrewId !== crewId) return false;
    if (songs.error) throw songs.error;
    if (members.error) throw members.error;
    const memberRows = members.data as CrewMemberRow[];
    if (!memberRows.some((m) => m.user_id === get().userId)) {
      // Removed from the crew (or it was deleted): back to the crew list.
      void get().loadCrews().catch(() => {});
      return false;
    }
    set({ songs: songs.data as CrewSongRow[], members: memberRows });
    return true;
  }

  /** Apply stage moves made on the crew board to my local songs. */
  function applyRemoteMoves() {
    const uid = get().userId;
    if (!uid || !canSync()) return;
    const app = useAppStore.getState();
    for (const m of remoteStageMoves(get().songs, app.workspace, uid)) {
      app.updateSong(m.path, { status: m.stage, stageUpdatedAtMs: m.atMs });
    }
  }

  function subscribe(crewId: string | null) {
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
    if (!supabase || !crewId) return;
    let joinedOnce = false;
    channel = supabase
      .channel(`crew:${crewId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "songs", filter: `crew_id=eq.${crewId}` }, (payload) => {
        if (get().activeCrewId !== crewId) return;
        const songs = get().songs.filter((s) => s.id !== ((payload.old as { id?: string })?.id ?? (payload.new as { id?: string })?.id));
        if (payload.eventType !== "DELETE") songs.unshift(payload.new as CrewSongRow);
        set({ songs });
        applyRemoteMoves();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crew_members", filter: `crew_id=eq.${crewId}` }, () => {
        if (get().activeCrewId === crewId) void loadCrewData().catch(() => {});
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Events missed while disconnected are never replayed: refetch.
          if (joinedOnce) void cycle();
          joinedOnce = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          set({ sync: { kind: "error", message: "Live updates paused. Reconnecting…" } });
        }
      });
  }

  async function push() {
    const sc = scope();
    if (!supabase || !sc || !canSync()) return;
    const app = useAppStore.getState();

    // Shares from before crew/account scoping belong to whoever syncs them first.
    for (const [path, meta] of Object.entries(app.workspace.songs)) {
      if (meta.shareId && (!meta.shareCrewId || !meta.shareUserId) && sharedHere(meta, sc)) {
        app.updateSong(path, { shareCrewId: sc.crewId, shareUserId: sc.userId });
      }
    }
    const { projects, workspace } = useAppStore.getState();
    const mine = new Set(get().songs.filter((s) => s.owner_id === sc.userId).map((s) => s.id));
    const rows = sharedPayloads(projects, workspace, sc);

    // New rows (with their stage); never overwrite an existing row this way.
    const fresh = rows.filter((r) => !mine.has(r.id) && !lastPushed.has(r.id));
    if (fresh.length) {
      const { error } = await supabase.from("songs").upsert(fresh, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
      for (const r of fresh) lastPushed.set(r.id, JSON.stringify({ ...r, stage: undefined }));
    }
    // Details of existing rows, without the stage.
    const changed = rows
      .filter((r) => mine.has(r.id))
      .map(({ stage: _stage, ...rest }) => rest)
      .filter((r) => lastPushed.get(r.id) !== JSON.stringify(r));
    if (changed.length) {
      const { error } = await supabase.from("songs").upsert(changed, { onConflict: "id" });
      if (error) throw error;
      for (const r of changed) lastPushed.set(r.id, JSON.stringify(r));
    }
    // My stage moves the crew hasn't seen (newer than the row's).
    for (const m of localStageMoves(get().songs, workspace, sc)) {
      const { error } = await supabase.rpc("set_song_stage", { p_song: m.id, p_stage: m.stage });
      if (error) throw error;
    }
    // Rows I explicitly stopped sharing.
    const stale = staleShareIds(get().songs, workspace, sc);
    if (stale.length) {
      const { error } = await supabase.from("songs").delete().in("id", stale);
      if (error) throw error;
      stale.forEach((id) => lastPushed.delete(id));
      const gone = new Set(stale);
      for (const [path, meta] of Object.entries(useAppStore.getState().workspace.songs)) {
        if (meta.shareId && gone.has(meta.shareId)) {
          useAppStore.getState().updateSong(path, { shareId: undefined, shareCrewId: undefined, shareUserId: undefined });
        }
      }
    }
  }

  /** One sync cycle (pull, apply, push), never two at once. */
  async function cycle(): Promise<void> {
    if (!canSync()) return;
    if (cycleRunning) {
      cycleAgain = true;
      return;
    }
    cycleRunning = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    try {
      do {
        cycleAgain = false;
        lastCycleMs = Date.now();
        set({ sync: { kind: "syncing" } });
        try {
          if (await loadCrewData()) {
            applyRemoteMoves();
            await push();
          }
          set({ sync: { kind: "synced", atMs: Date.now() } });
        } catch (e) {
          set({ sync: { kind: "error", message: crewErrorMessage(e) } });
          retryTimer = setTimeout(() => void cycle(), RETRY_MS);
          return;
        }
      } while (cycleAgain && canSync());
    } finally {
      cycleRunning = false;
    }
  }

  function resetSession() {
    subscribe(null);
    if (pushTimer) clearTimeout(pushTimer);
    if (retryTimer) clearTimeout(retryTimer);
    pushTimer = retryTimer = null;
    lastPushed.clear();
  }

  return {
    enabled: !!supabase,
    ready: false,
    userId: null,
    email: null,
    crews: [],
    loadError: null,
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
      try {
        const { data } = await supabase.auth.getSession();
        set({ userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null });
      } catch {
        // Offline at launch with an expired token: show signed out; the
        // auth listener below picks the session back up when it refreshes.
      }
      set({ ready: true });
      supabase.auth.onAuthStateChange((_event, session) => {
        const userId = session?.user.id ?? null;
        if (userId === get().userId) return;
        resetSession();
        set({ userId, email: session?.user.email ?? null, crews: [], loadError: null, activeCrewId: null, songs: [], members: [], invite: null, sync: { kind: "idle" } });
        // Not awaited: supabase-js forbids awaiting its own calls in this callback.
        if (userId) setTimeout(() => void get().loadCrews().catch(() => {}), 0);
      });
      if (get().userId) await get().loadCrews().catch(() => {});
      // Sync shortly after local changes (statuses, tags, a new scan…), and
      // once the workspace has loaded if it wasn't yet.
      useAppStore.subscribe((state, prev) => {
        const loaded = state.workspaceWritable && !prev.workspaceWritable;
        if (!loaded && state.workspace === prev.workspace && state.projects === prev.projects) return;
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => void cycle(), PUSH_DELAY_MS);
      });
      const wake = () => {
        if (Date.now() - lastCycleMs > FOCUS_MIN_GAP_MS) void cycle();
      };
      window.addEventListener("focus", wake);
      window.addEventListener("online", wake);
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
      writeActiveCrew(null);
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(crewErrorMessage(error));
    },

    loadCrews: async () => {
      if (!supabase || !get().userId) return;
      const { data, error } = await supabase
        .from("crew_members")
        .select("crew_id, role, display_name, crews(name)")
        .eq("user_id", get().userId!);
      if (error) {
        set({ loadError: crewErrorMessage(error) });
        throw new Error(crewErrorMessage(error));
      }
      const crews: CrewSummary[] = (data ?? []).map((r) => ({
        id: r.crew_id as string,
        name: ((r.crews as unknown as { name: string } | null)?.name ?? "Crew") as string,
        role: r.role as CrewSummary["role"],
        displayName: r.display_name as string,
      }));
      set({ crews, loadError: null });
      const remembered = readActiveCrew();
      const pick = crews.find((c) => c.id === remembered)?.id ?? crews[0]?.id ?? null;
      await get().selectCrew(pick);
    },

    selectCrew: async (id) => {
      writeActiveCrew(id);
      lastPushed.clear();
      set({ activeCrewId: id, invite: null, songs: [], members: [], sync: { kind: "idle" } });
      subscribe(id);
      if (!id) return;
      if (canSync()) return cycle();
      // Workspace not ready (or sample data): still show the crew's board.
      await loadCrewData().catch((e) => set({ sync: { kind: "error", message: crewErrorMessage(e) } }));
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
      if (!data) throw new Error("That invite code isn't valid: it's wrong, expired or used up. Ask for a new one.");
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
      const sc = scope();
      if (!supabase || !sc) return;
      const { error } = await supabase.from("crew_members").delete().eq("crew_id", sc.crewId).eq("user_id", sc.userId);
      if (error) throw new Error(crewErrorMessage(error));
      // The server removed my songs from that crew; forget those shares here.
      const app = useAppStore.getState();
      for (const [path, meta] of Object.entries(app.workspace.songs)) {
        if (meta.shareId && sharedHere({ ...meta, shared: true }, sc)) {
          app.updateSong(path, { shared: false, shareId: undefined, shareCrewId: undefined, shareUserId: undefined });
        }
      }
      writeActiveCrew(null);
      await get().loadCrews();
    },

    setShared: (paths, shared) => {
      const sc = scope();
      if (!sc) return;
      const app = useAppStore.getState();
      for (const path of paths) {
        const meta = app.workspace.songs[path] ?? {};
        const mineHere = meta.shareId && meta.shareCrewId === sc.crewId && meta.shareUserId === sc.userId;
        if (shared) {
          app.updateSong(path, { shared: true, shareId: mineHere ? meta.shareId : uuid(), shareCrewId: sc.crewId, shareUserId: sc.userId });
        } else if (sharedHere(meta, sc)) {
          // Keep the id so the next sync knows which row to delete.
          app.updateSong(path, { shared: false, shareCrewId: sc.crewId, shareUserId: sc.userId });
        }
      }
    },

    moveCrewSong: async (songId, stage) => {
      if (!supabase) return;
      const before = get().songs;
      set({ songs: before.map((s) => (s.id === songId ? { ...s, stage, stage_updated_at: new Date().toISOString(), stage_updated_by: get().userId } : s)) });
      const { error } = await supabase.rpc("set_song_stage", { p_song: songId, p_stage: stage });
      if (error) {
        set({ songs: before });
        throw new Error(crewErrorMessage(error));
      }
      // The realtime echo carries the server's stamp; refetch if it's slow.
      void cycle();
    },

    syncNow: () => cycle(),
  };
});
