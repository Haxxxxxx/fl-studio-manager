import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CrewMemberRow, CrewSongRow, CrewSummary, SongStatus } from "@shared/types";
import { errorMessage, supabase } from "./supabase";

// The web dashboard's state: session, crews, the active crew's shared songs
// and members, live updates. Same rules as the desktop app; no local files.

const ACTIVE_CREW_KEY = "flm-crew-web-active";
const SAFETY_REFRESH_MS = 5 * 60_000;

interface WebState {
  ready: boolean;
  userId: string | null;
  email: string | null;
  crews: CrewSummary[];
  /** Loading the crew list failed (so an empty list doesn't mean "no crews"). */
  loadError: string | null;
  activeCrewId: string | null;
  songs: CrewSongRow[];
  members: CrewMemberRow[];
  error: string | null;

  init: () => Promise<void>;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  loadCrews: () => Promise<void>;
  selectCrew: (id: string | null) => Promise<void>;
  createCrew: (name: string, displayName: string) => Promise<void>;
  joinCrew: (code: string, displayName: string) => Promise<void>;
  moveSong: (songId: string, stage: SongStatus | null) => Promise<void>;
}

let channel: RealtimeChannel | null = null;
let initialized = false;

const remember = (id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_CREW_KEY, id);
    else localStorage.removeItem(ACTIVE_CREW_KEY);
  } catch {
    /* convenience only */
  }
};
const remembered = () => {
  try {
    return localStorage.getItem(ACTIVE_CREW_KEY);
  } catch {
    return null;
  }
};

export const useWeb = create<WebState>((set, get) => {
  async function loadCrewData() {
    const id = get().activeCrewId;
    if (!supabase || !id) return set({ songs: [], members: [] });
    const [songs, members] = await Promise.all([
      supabase.from("songs").select("*").eq("crew_id", id).order("updated_at", { ascending: false }),
      supabase.from("crew_members").select("*").eq("crew_id", id).order("joined_at"),
    ]);
    if (get().activeCrewId !== id) return;
    if (songs.error) throw songs.error;
    if (members.error) throw members.error;
    const memberRows = members.data as CrewMemberRow[];
    if (!memberRows.some((m) => m.user_id === get().userId)) {
      // Removed from the crew (or it was deleted): back to the crew list.
      return void get().loadCrews().catch((e) => set({ error: errorMessage(e) }));
    }
    set({ songs: songs.data as CrewSongRow[], members: memberRows, error: null });
  }

  /** Refetch (after a reconnect, or when the tab/phone comes back). */
  let lastRefresh = 0;
  function refresh() {
    if (!get().activeCrewId || Date.now() - lastRefresh < 5000) return;
    lastRefresh = Date.now();
    void loadCrewData().catch((e) => set({ error: errorMessage(e) }));
  }

  function subscribe(id: string | null) {
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
    if (!supabase || !id) return;
    let joinedOnce = false;
    const upsertSong = (row: CrewSongRow) => {
      if (get().activeCrewId !== id || !row?.id) return;
      set({ songs: [row, ...get().songs.filter((s) => s.id !== row.id)] });
    };
    const reloadMembers = () => {
      if (get().activeCrewId === id) void loadCrewData().catch(() => {});
    };
    // Realtime never delivers DELETE events through a filter, and a deleted
    // row arrives with only its primary key: deletes come unfiltered and are
    // matched by key (anything unknown is ignored).
    channel = supabase
      .channel(`web-crew:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "songs", filter: `crew_id=eq.${id}` }, (p) => upsertSong(p.new as CrewSongRow))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "songs", filter: `crew_id=eq.${id}` }, (p) => upsertSong(p.new as CrewSongRow))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "songs" }, (p) => {
        const gone = (p.old as { id?: string })?.id;
        if (get().activeCrewId !== id || !gone || !get().songs.some((s) => s.id === gone)) return;
        set({ songs: get().songs.filter((s) => s.id !== gone) });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_members", filter: `crew_id=eq.${id}` }, reloadMembers)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crew_members", filter: `crew_id=eq.${id}` }, reloadMembers)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "crew_members" }, (p) => {
        const old = p.old as Partial<CrewMemberRow>;
        if (get().activeCrewId !== id || old.crew_id !== id) return;
        // Removed by the owner (or the crew was deleted): back to the crew list.
        if (old.user_id === get().userId) return void get().loadCrews().catch((e) => set({ error: errorMessage(e) }));
        reloadMembers();
      })
      .subscribe((status) => {
        // Events missed while disconnected are never replayed: refetch.
        if (status === "SUBSCRIBED") {
          if (joinedOnce) refresh();
          joinedOnce = true;
        }
      });
  }

  return {
    ready: false,
    userId: null,
    email: null,
    crews: [],
    loadError: null,
    activeCrewId: null,
    songs: [],
    members: [],
    error: null,

    init: async () => {
      if (initialized) return;
      initialized = true;
      if (!supabase) return set({ ready: true, error: "This site isn't connected to a crew server yet." });
      try {
        const { data } = await supabase.auth.getSession();
        set({ userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null });
      } catch (e) {
        set({ error: errorMessage(e) });
      }
      supabase.auth.onAuthStateChange((_e, session) => {
        const userId = session?.user.id ?? null;
        if (userId === get().userId) return;
        subscribe(null);
        set({ userId, email: session?.user.email ?? null, crews: [], loadError: null, activeCrewId: null, songs: [], members: [], error: null });
        // Not awaited: supabase-js forbids awaiting its own calls in this callback.
        if (userId) setTimeout(() => void get().loadCrews().catch((e) => set({ error: errorMessage(e) })), 0);
      });
      // A phone left on the board: catch up when it's looked at again.
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refresh());
      window.addEventListener("online", refresh);
      // Safety net for anything realtime missed (it never replays events).
      setInterval(() => document.visibilityState === "visible" && refresh(), SAFETY_REFRESH_MS);
      if (get().userId) await get().loadCrews().catch((e) => set({ error: errorMessage(e) }));
      set({ ready: true });
    },

    sendCode: async (email) => {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
      if (error) throw new Error(errorMessage(error));
    },

    verifyCode: async (email, code) => {
      if (!supabase) return;
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (error) throw new Error(errorMessage(error));
    },

    signOut: async () => {
      if (!supabase) return;
      remember(null);
      // This browser only: the desktop app and other devices stay signed in.
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error(errorMessage(error));
    },

    loadCrews: async () => {
      if (!supabase || !get().userId) return;
      const { data, error } = await supabase.from("crew_members").select("crew_id, role, display_name, crews(name)").eq("user_id", get().userId!);
      if (error) {
        set({ loadError: errorMessage(error) });
        throw new Error(errorMessage(error));
      }
      const crews: CrewSummary[] = (data ?? []).map((r) => ({
        id: r.crew_id as string,
        name: (r.crews as unknown as { name: string } | null)?.name ?? "Crew",
        role: r.role as CrewSummary["role"],
        displayName: r.display_name as string,
      }));
      set({ crews, loadError: null });
      const pick = crews.find((c) => c.id === remembered())?.id ?? crews[0]?.id ?? null;
      await get().selectCrew(pick);
    },

    selectCrew: async (id) => {
      remember(id);
      set({ activeCrewId: id, songs: [], members: [], error: null });
      subscribe(id);
      if (id) await loadCrewData().catch((e) => set({ error: errorMessage(e) }));
    },

    createCrew: async (name, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("create_crew", { p_name: name.trim(), p_display_name: displayName.trim() });
      if (error) throw new Error(errorMessage(error));
      remember(data as string);
      await get().loadCrews();
    },

    joinCrew: async (code, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("join_crew", { p_code: code.trim(), p_display_name: displayName.trim() });
      if (error) throw new Error(errorMessage(error));
      if (!data) throw new Error("That invite code didn't work: it's wrong, expired, used up or revoked (or you're already in 10 crews). Ask for a new one.");
      remember(data as string);
      await get().loadCrews();
    },

    moveSong: async (songId, stage) => {
      if (!supabase) return;
      const before = get().songs;
      set({ songs: before.map((s) => (s.id === songId ? { ...s, stage, stage_updated_at: new Date().toISOString(), stage_updated_by: get().userId } : s)) });
      const { error } = await supabase.rpc("set_song_stage", { p_song: songId, p_stage: stage });
      if (error) {
        set({ songs: before, error: errorMessage(error) });
        throw new Error(errorMessage(error));
      }
      set({ error: null });
    },
  };
});
