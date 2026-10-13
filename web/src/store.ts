import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { CrewMemberRow, CrewSongRow, CrewSummary, SongStatus } from "@shared/types";
import { errorMessage, supabase } from "./supabase";

// The web dashboard's state: session, crews, the active crew's shared songs
// and members, live updates. Same rules as the desktop app; no local files.

const ACTIVE_CREW_KEY = "flm-crew-web-active";

interface WebState {
  ready: boolean;
  userId: string | null;
  email: string | null;
  crews: CrewSummary[];
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
    if (songs.error) throw songs.error;
    if (members.error) throw members.error;
    set({ songs: songs.data as CrewSongRow[], members: members.data as CrewMemberRow[] });
  }

  function subscribe(id: string | null) {
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
    if (!supabase || !id) return;
    channel = supabase
      .channel(`web-crew:${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "songs", filter: `crew_id=eq.${id}` }, (p) => {
        const gone = (p.old as { id?: string })?.id ?? (p.new as { id?: string })?.id;
        const songs = get().songs.filter((s) => s.id !== gone);
        if (p.eventType !== "DELETE") songs.unshift(p.new as CrewSongRow);
        set({ songs });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crew_members", filter: `crew_id=eq.${id}` }, () => {
        void loadCrewData().catch(() => {});
      })
      .subscribe();
  }

  return {
    ready: false,
    userId: null,
    email: null,
    crews: [],
    activeCrewId: null,
    songs: [],
    members: [],
    error: null,

    init: async () => {
      if (initialized) return;
      initialized = true;
      if (!supabase) return set({ ready: true, error: "This site isn't connected to a crew server yet." });
      const { data } = await supabase.auth.getSession();
      set({ userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null });
      supabase.auth.onAuthStateChange((_e, session) => {
        const userId = session?.user.id ?? null;
        if (userId === get().userId) return;
        set({ userId, email: session?.user.email ?? null, crews: [], activeCrewId: null, songs: [], members: [] });
        if (userId) void get().loadCrews().catch(() => {});
        else subscribe(null);
      });
      if (get().userId) await get().loadCrews().catch((e) => set({ error: errorMessage(e) }));
      set({ ready: true });
    },

    sendCode: async (email) => {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
      if (error) throw new Error(errorMessage(error));
    },

    verifyCode: async (email, code) => {
      if (!supabase) return;
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (error) throw new Error(errorMessage(error));
    },

    signOut: async () => {
      if (!supabase) return;
      subscribe(null);
      remember(null);
      await supabase.auth.signOut();
    },

    loadCrews: async () => {
      if (!supabase || !get().userId) return;
      const { data, error } = await supabase.from("crew_members").select("crew_id, role, display_name, crews(name)").eq("user_id", get().userId!);
      if (error) throw new Error(errorMessage(error));
      const crews: CrewSummary[] = (data ?? []).map((r) => ({
        id: r.crew_id as string,
        name: (r.crews as unknown as { name: string } | null)?.name ?? "Crew",
        role: r.role as CrewSummary["role"],
        displayName: r.display_name as string,
      }));
      set({ crews });
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
      const { data, error } = await supabase.rpc("create_crew", { p_name: name, p_display_name: displayName });
      if (error) throw new Error(errorMessage(error));
      remember(data as string);
      await get().loadCrews();
    },

    joinCrew: async (code, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("join_crew", { p_code: code, p_display_name: displayName });
      if (error) throw new Error(errorMessage(error));
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
    },
  };
});
