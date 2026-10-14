import { statusInfo } from "../lib/songs";
import { crewText } from "../lib/crewMessages";
import { create } from "zustand";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { crewErrorMessage, supabase } from "../lib/supabase";
import { releasePayloads, releaseSharedHere, shareElsewhere, sharedHere, sharedPayloads, stageSync, staleReleaseIds, staleShareIds, type ShareScope, type StageSync } from "../lib/crewSync";
import type { CrewColumnRow, CrewMemberRow, CrewReleaseRow, CrewSongRow, CrewSummary, PipelineConfig, SongStatus } from "../types";
import { applyCardMove, columnsPayload, crewMove, crewPipeline, restoreSongs } from "../lib/crewBoard";
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
const SAFETY_SYNC_MS = 5 * 60_000;

export interface CrewInvite {
  code: string;
  crew_id: string;
  expires_at: string;
  max_uses: number;
  uses: number;
}

type SyncState =
  | { kind: "idle" }
  | { kind: "syncing" }
  /** `skipped`: shared songs the database refused, left out of the push. */
  | { kind: "synced"; atMs: number; skipped: number }
  | { kind: "error"; message: string };

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
  /** The crew board's columns (empty: one per stage, never edited). */
  columns: CrewColumnRow[];
  /** Releases shared with the active crew (everyone's). */
  releases: CrewReleaseRow[];
  invite: string | null;
  /** Open invite codes of the active crew (owners only). */
  invites: CrewInvite[];
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
  loadInvites: () => Promise<void>;
  revokeInvite: (code: string) => Promise<void>;
  /** Owner: remove a crewmate (their shared songs leave with them). */
  removeMember: (userId: string) => Promise<void>;
  leaveCrew: () => Promise<void>;
  /** Share or stop sharing songs with the active crew. Songs shared with
   * another crew are left alone (see moveShares). */
  /** Returns how many songs were skipped because they're shared with another crew. */
  setShared: (paths: string[], shared: boolean) => number;
  /** Take songs off another crew's board and share them here instead. */
  moveShares: (paths: string[]) => Promise<void>;
  /** Move any crew song on the shared board. */
  moveCrewSong: (songId: string, stage: SongStatus | null) => Promise<void>;
  /** A crewmate moved my song while my move was waiting: keep theirs or mine. */
  resolveStageConflict: (path: string, keep: "theirs" | "mine") => void;
  syncNow: () => Promise<void>;
  /** Owner: save the crew board's columns (the whole set, src/lib/crewBoard.ts). */
  saveCrewColumns: (cfg: PipelineConfig) => Promise<void>;
  /** Share a release with the active crew, with all its tracks (or stop
   * sharing it; its tracks stay shared). Returns how many tracks were skipped
   * because they're shared with another crew. */
  shareRelease: (albumId: string, shared: boolean) => number;
  /** Move a crew card to a column, before another card (or at the end). */
  moveCrewCard: (songId: string, columnId: string, beforeId: string | null) => Promise<void>;
}

let initialized = false;
let channel: RealtimeChannel | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let cycleRunning = false;
let cycleAgain = false;
let lastCycleMs = 0;
/** Last payload pushed per release id. */
const lastPushedRelease = new Map<string, string>();
/** Last payload pushed per song id, so unchanged songs aren't re-sent. */
const lastPushed = new Map<string, string>();
/** Payloads the database refused (bad value): not retried until they change. */
const rejected = new Map<string, string>();

/** A refusal caused by one row's values (check, not-null, invalid input),
 * rather than the network, auth or a quota. */
function isBadValue(e: { code?: string }): boolean {
  return !!e.code && (e.code.startsWith("22") || e.code === "23514" || e.code === "23502");
}

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
      set({ songs: [], members: [], columns: [], releases: [] });
      return false;
    }
    const [songs, members, columns, releases] = await Promise.all([
      supabase.from("songs").select("*").eq("crew_id", crewId).order("updated_at", { ascending: false }),
      supabase.from("crew_members").select("*").eq("crew_id", crewId).order("joined_at"),
      supabase.from("crew_columns").select("*").eq("crew_id", crewId).order("position"),
      supabase.from("releases").select("*").eq("crew_id", crewId).order("release_date", { ascending: true, nullsFirst: false }),
    ]);
    if (get().activeCrewId !== crewId) return false;
    if (songs.error) throw songs.error;
    if (members.error) throw members.error;
    // An older crew server without board columns: one column per stage.
    const columnRows = columns.error ? [] : (columns.data as CrewColumnRow[]);
    const memberRows = members.data as CrewMemberRow[];
    if (!memberRows.some((m) => m.user_id === get().userId)) {
      // Removed from the crew (or it was deleted): back to the crew list.
      void get().loadCrews().catch(() => {});
      return false;
    }
    if (releases.error) throw releases.error;
    set({ songs: songs.data as CrewSongRow[], members: memberRows, columns: columnRows, releases: releases.data as CrewReleaseRow[] });
    return true;
  }

  /** A realtime insert/update of one of the active crew's songs. */
  function upsertSong(crewId: string, row: CrewSongRow) {
    if (get().activeCrewId !== crewId || !row?.id) return;
    set({ songs: [row, ...get().songs.filter((s) => s.id !== row.id)] });
    applyRemoteMoves();
  }

  /** Apply the crew's stage moves to my local songs (adopt, settle, or flag
   * a conflict). Sending my own waiting moves is push()'s job. */
  function applyRemoteMoves() {
    const sc = scope();
    if (!sc || !canSync()) return;
    for (const a of stageSync(get().songs, useAppStore.getState().workspace, sc)) {
      if (a.kind !== "push") applyStage(a);
    }
  }

  function applyStage(a: Exclude<StageSync, { kind: "push" }>) {
    const app = useAppStore.getState();
    if (a.kind === "adopt") {
      app.updateSong(a.path, { status: a.stage, stageBaseAt: a.at, stagePending: false, stageConflict: undefined, stageUpdatedAtMs: Date.parse(a.at) });
    } else if (a.kind === "settle") {
      app.updateSong(a.path, { stageBaseAt: a.at, stagePending: false, stageConflict: undefined });
    } else {
      app.updateSong(a.path, { stageConflict: a.conflict });
    }
  }

  /** move_song_stage: applied only if the song is still at `expected`. */
  async function moveStage(id: string, stage: SongStatus | null, expected: string | null) {
    if (!supabase) throw new Error("crew sharing is off");
    const { data, error } = await supabase.rpc("move_song_stage", { p_song: id, p_stage: stage, p_expected_at: expected });
    if (error) throw error;
    const r = (Array.isArray(data) ? data[0] : data) as { applied: boolean; stage: SongStatus | null; stage_updated_at: string; stage_updated_by: string | null };
    set({ songs: get().songs.map((s) => (s.id === id ? { ...s, stage: r.stage, stage_updated_at: r.stage_updated_at, stage_updated_by: r.stage_updated_by } : s)) });
    return r;
  }

  function upsertRelease(crewId: string, row: CrewReleaseRow) {
    if (get().activeCrewId !== crewId || !row?.id) return;
    set({ releases: [...get().releases.filter((r) => r.id !== row.id), row] });
  }

  async function reloadColumns(crewId: string) {
    if (!supabase || get().activeCrewId !== crewId) return;
    const { data, error } = await supabase.from("crew_columns").select("*").eq("crew_id", crewId).order("position");
    if (!error && get().activeCrewId === crewId) set({ columns: data as CrewColumnRow[] });
  }

  function subscribe(crewId: string | null) {
    if (channel && supabase) void supabase.removeChannel(channel);
    channel = null;
    if (!supabase || !crewId) return;
    let joinedOnce = false;
    // Realtime never delivers DELETE events through a filter, and a deleted
    // row arrives with only its primary key. So inserts/updates are filtered
    // to this crew; deletes come unfiltered and are matched by key against
    // what's on screen (anything unknown is ignored).
    channel = supabase
      .channel(`crew:${crewId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "songs", filter: `crew_id=eq.${crewId}` }, (p) => upsertSong(crewId, p.new as CrewSongRow))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "songs", filter: `crew_id=eq.${crewId}` }, (p) => upsertSong(crewId, p.new as CrewSongRow))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "songs" }, (p) => {
        const id = (p.old as { id?: string })?.id;
        if (get().activeCrewId !== crewId || !id || !get().songs.some((s) => s.id === id)) return;
        set({ songs: get().songs.filter((s) => s.id !== id) });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "releases", filter: `crew_id=eq.${crewId}` }, (p) => upsertRelease(crewId, p.new as CrewReleaseRow))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "releases", filter: `crew_id=eq.${crewId}` }, (p) => upsertRelease(crewId, p.new as CrewReleaseRow))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "releases" }, (p) => {
        const id = (p.old as { id?: string })?.id;
        if (get().activeCrewId !== crewId || !id || !get().releases.some((r) => r.id === id)) return;
        set({ releases: get().releases.filter((r) => r.id !== id) });
      })
      // The owner edited the board's columns (a whole set at a time): refetch them.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_columns", filter: `crew_id=eq.${crewId}` }, () => void reloadColumns(crewId))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crew_columns", filter: `crew_id=eq.${crewId}` }, () => void reloadColumns(crewId))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "crew_columns" }, (p) => {
        const id = (p.old as { id?: string })?.id;
        if (id && get().columns.some((c) => c.id === id)) void reloadColumns(crewId);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "crew_members", filter: `crew_id=eq.${crewId}` }, () => {
        if (get().activeCrewId === crewId) void loadCrewData().catch(() => {});
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "crew_members", filter: `crew_id=eq.${crewId}` }, () => {
        if (get().activeCrewId === crewId) void loadCrewData().catch(() => {});
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "crew_members" }, (p) => {
        const old = p.old as Partial<CrewMemberRow>;
        if (get().activeCrewId !== crewId || old.crew_id !== crewId) return;
        // Removed by the owner (or the crew was deleted): back to the crew list.
        if (old.user_id === get().userId) return void get().loadCrews().catch(() => {});
        // A crewmate left: their songs went with them.
        void loadCrewData().catch(() => {});
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

  /** Upsert rows in one request. If the database refuses the batch over a
   * bad value (a CHECK or a malformed field), retry them one by one and skip
   * the bad ones, so one song can't block everyone else's. Returns the rows
   * that went through. */
  async function upsertRows<T extends { id: string }>(rows: T[], onlyNew: boolean): Promise<T[]> {
    if (!supabase || !rows.length) return [];
    const opts = onlyNew ? { onConflict: "id", ignoreDuplicates: true } : { onConflict: "id" };
    const { error } = await supabase.from("songs").upsert(rows, opts);
    if (!error) {
      rows.forEach((r) => rejected.delete(r.id));
      return rows;
    }
    if (!isBadValue(error)) throw error;
    const ok: T[] = [];
    for (const r of rows) {
      const res = await supabase.from("songs").upsert([r], opts);
      if (!res.error) {
        rejected.delete(r.id);
        ok.push(r);
      } else if (isBadValue(res.error)) rejected.set(r.id, JSON.stringify(r));
      else throw res.error;
    }
    return ok;
  }

  /** Push my shared songs. Returns how many the database refused. */
  async function push(): Promise<number> {
    const sc = scope();
    if (!supabase || !sc || !canSync()) return 0;
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
    const fresh = rows.filter((r) => !mine.has(r.id) && !lastPushed.has(r.id) && rejected.get(r.id) !== JSON.stringify(r));
    for (const r of await upsertRows(fresh, true)) lastPushed.set(r.id, JSON.stringify({ ...r, stage: undefined }));
    // Details of existing rows, without the stage.
    const changed = rows
      .filter((r) => mine.has(r.id))
      .map(({ stage: _stage, ...rest }) => rest)
      .filter((r) => lastPushed.get(r.id) !== JSON.stringify(r) && rejected.get(r.id) !== JSON.stringify(r));
    for (const r of await upsertRows(changed, false)) lastPushed.set(r.id, JSON.stringify(r));
    // Stage: the crew's moves first, then mine, each sent with the version it
    // was made on (a crewmate's move in between makes it a conflict).
    for (const a of stageSync(get().songs, workspace, sc)) {
      if (a.kind !== "push") {
        applyStage(a);
        continue;
      }
      const r = await moveStage(a.id, a.stage, a.base);
      if (r.applied) applyStage({ kind: "settle", path: a.path, at: r.stage_updated_at });
      else applyStage({ kind: "conflict", path: a.path, conflict: { mine: a.stage, theirs: r.stage, by: r.stage_updated_by, at: r.stage_updated_at } });
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
    await pushReleases(sc);
    return rows.filter((r) => rejected.has(r.id)).length;
  }

  /** My shared releases: send what changed, delete what I unshared or deleted. */
  async function pushReleases(sc: ShareScope) {
    if (!supabase) return;
    const app = useAppStore.getState();
    // Adopt scope on first sync, like songs.
    for (const a of app.workspace.albums) {
      if (a.shared && a.shareId && (!a.shareCrewId || !a.shareUserId) && releaseSharedHere(a, sc)) {
        app.updateAlbum(a.id, { shareCrewId: sc.crewId, shareUserId: sc.userId });
      }
    }
    const { workspace } = useAppStore.getState();
    const changed = releasePayloads(workspace, sc).filter((r) => lastPushedRelease.get(r.id) !== JSON.stringify(r));
    if (changed.length) {
      const { error } = await supabase.from("releases").upsert(changed, { onConflict: "id" });
      if (error) throw error;
      changed.forEach((r) => lastPushedRelease.set(r.id, JSON.stringify(r)));
    }
    const stale = staleReleaseIds(get().releases, workspace, sc);
    const tombs = (workspace.deletedReleaseShares ?? []).filter((d) => d.crewId === sc.crewId && d.userId === sc.userId).map((d) => d.id);
    if (stale.length) {
      const { error } = await supabase.from("releases").delete().in("id", stale);
      if (error) throw error;
      stale.forEach((id) => lastPushedRelease.delete(id));
      set({ releases: get().releases.filter((r) => !stale.includes(r.id)) });
      for (const a of useAppStore.getState().workspace.albums) {
        if (a.shareId && stale.includes(a.shareId)) useAppStore.getState().updateAlbum(a.id, { shareId: undefined, shareCrewId: undefined, shareUserId: undefined });
      }
    }
    // Deleted here and gone there (or never pushed): forget the markers.
    const done = tombs.filter((id) => !get().releases.some((r) => r.id === id));
    if (done.length) useAppStore.getState().clearDeletedReleaseShares(done);
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
          let skipped = 0;
          if (await loadCrewData()) {
            applyRemoteMoves();
            skipped = await push();
          }
          set({ sync: { kind: "synced", atMs: Date.now(), skipped } });
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
    lastPushedRelease.clear();
    rejected.clear();
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
    columns: [],
    releases: [],
    invite: null,
    invites: [],
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
        set({ userId, email: session?.user.email ?? null, crews: [], loadError: null, activeCrewId: null, songs: [], members: [], columns: [], releases: [], invite: null, invites: [], sync: { kind: "idle" } });
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
      // Safety net for anything realtime missed (it never replays events).
      setInterval(() => {
        if (Date.now() - lastCycleMs > SAFETY_SYNC_MS) void cycle();
      }, SAFETY_SYNC_MS);
    },

    sendCode: async (email) => {
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
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
      // This device only: the web dashboard or another computer stays signed in.
      const { error } = await supabase.auth.signOut({ scope: "local" });
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
      rejected.clear();
      set({ activeCrewId: id, invite: null, invites: [], songs: [], members: [], columns: [], releases: [], sync: { kind: "idle" } });
      subscribe(id);
      if (!id) return;
      if (canSync()) return cycle();
      // Workspace not ready (or sample data): still show the crew's board.
      await loadCrewData().catch((e) => set({ sync: { kind: "error", message: crewErrorMessage(e) } }));
    },

    createCrew: async (name, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("create_crew", { p_name: name.trim(), p_display_name: displayName.trim() });
      if (error) throw new Error(crewErrorMessage(error));
      writeActiveCrew(data as string);
      await get().loadCrews();
    },

    joinCrew: async (code, displayName) => {
      if (!supabase) return;
      const { data, error } = await supabase.rpc("join_crew", { p_code: code.trim(), p_display_name: displayName.trim() });
      if (error) throw new Error(crewErrorMessage(error));
      if (!data) throw new Error(crewText("invalidInvite"));
      writeActiveCrew(data as string);
      await get().loadCrews();
    },

    createInvite: async () => {
      if (!supabase || !get().activeCrewId) throw new Error("Choose a crew first.");
      const { data, error } = await supabase.rpc("create_invite", { p_crew: get().activeCrewId, p_max_uses: 10 });
      if (error) throw new Error(crewErrorMessage(error));
      set({ invite: data as string });
      void get().loadInvites().catch(() => {});
      return data as string;
    },

    loadInvites: async () => {
      const crewId = get().activeCrewId;
      if (!supabase || !crewId) return;
      // Owners only (row-level security returns nothing to members).
      const { data, error } = await supabase
        .from("crew_invites")
        .select("code, crew_id, expires_at, max_uses, uses")
        .eq("crew_id", crewId)
        .order("expires_at");
      if (error) throw new Error(crewErrorMessage(error));
      if (get().activeCrewId !== crewId) return;
      const now = Date.now();
      set({ invites: (data as CrewInvite[]).filter((i) => Date.parse(i.expires_at) > now && i.uses < i.max_uses) });
    },

    revokeInvite: async (code) => {
      if (!supabase) return;
      const { error } = await supabase.from("crew_invites").delete().eq("code", code);
      if (error) throw new Error(crewErrorMessage(error));
      set({ invites: get().invites.filter((i) => i.code !== code), invite: get().invite === code ? null : get().invite });
    },

    removeMember: async (userId) => {
      const sc = scope();
      if (!supabase || !sc || userId === sc.userId) return;
      // Their shared songs leave with them (after_member_left on the server).
      const { error } = await supabase.from("crew_members").delete().eq("crew_id", sc.crewId).eq("user_id", userId);
      if (error) throw new Error(crewErrorMessage(error));
      await loadCrewData();
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
      if (!sc) return 0;
      const app = useAppStore.getState();
      let skipped = 0;
      for (const path of paths) {
        const meta = app.workspace.songs[path] ?? {};
        if (shared) {
          // Shared (or being unshared) elsewhere: a new id would strand that
          // row, so leave it; moving it is explicit (moveShares).
          if (shareElsewhere(meta, sc)) {
            skipped++;
            continue;
          }
          app.updateSong(path, { shared: true, shareId: meta.shareId ?? uuid(), shareCrewId: sc.crewId, shareUserId: sc.userId });
        } else if (sharedHere(meta, sc)) {
          // Keep the id so the next sync knows which row to delete.
          app.updateSong(path, { shared: false, shareCrewId: sc.crewId, shareUserId: sc.userId });
        }
      }
      return skipped;
    },

    moveShares: async (paths) => {
      const sc = scope();
      if (!supabase || !sc) return;
      const app = useAppStore.getState();
      const moving = paths.filter((p) => shareElsewhere(app.workspace.songs[p], sc)?.mine);
      const oldIds = moving.map((p) => app.workspace.songs[p].shareId!);
      if (!oldIds.length) return;
      // Take it off the other crew's board first (my rows only); share it
      // here only once that worked, so a row is never left behind.
      const { error } = await supabase.from("songs").delete().in("id", oldIds).eq("owner_id", sc.userId);
      if (error) throw new Error(crewErrorMessage(error));
      oldIds.forEach((id) => (lastPushed.delete(id), rejected.delete(id)));
      for (const path of moving) {
        useAppStore.getState().updateSong(path, { shared: true, shareId: uuid(), shareCrewId: sc.crewId, shareUserId: sc.userId });
      }
    },

    moveCrewSong: async (songId, stage) => {
      if (!supabase) return;
      const before = get().songs;
      const row = before.find((s) => s.id === songId);
      // Optimistic stage only: the version stays the one this move was made on.
      set({ songs: before.map((s) => (s.id === songId ? { ...s, stage } : s)) });
      let r;
      try {
        r = await moveStage(songId, stage, row?.stage_updated_at ?? null);
      } catch (e) {
        set({ songs: before });
        throw new Error(crewErrorMessage(e));
      }
      applyRemoteMoves();
      if (!r.applied) {
        const who = get().members.find((m) => m.user_id === r.stage_updated_by)?.display_name ?? crewText("someone");
        throw new Error(crewText("movedMeanwhile", undefined, { who, stage: statusInfo(r.stage ?? undefined).label }));
      }
    },

    resolveStageConflict: (path, keep) => {
      const app = useAppStore.getState();
      const c = app.workspace.songs[path]?.stageConflict;
      if (!c) return;
      if (keep === "theirs") {
        app.updateSong(path, { status: c.theirs ?? undefined, stageBaseAt: c.at, stagePending: false, stageConflict: undefined, stageUpdatedAtMs: Date.parse(c.at) });
      } else {
        // Mine again, now on top of their version: the next sync sends it.
        app.updateSong(path, { stageBaseAt: c.at, stagePending: true, stageConflict: undefined });
        void cycle();
      }
    },

    syncNow: () => cycle(),

    saveCrewColumns: async (cfg) => {
      const crewId = get().activeCrewId;
      if (!supabase || !crewId) return;
      const before = get().columns;
      const payload = columnsPayload(cfg, uuid);
      set({ columns: payload.map((c, i) => ({ ...c, crew_id: crewId, position: i })) });
      const { data, error } = await supabase.rpc("set_crew_columns", { p_crew: crewId, p_columns: payload });
      if (error) {
        if (get().activeCrewId === crewId) set({ columns: before });
        throw new Error(crewErrorMessage(error));
      }
      if (get().activeCrewId === crewId) set({ columns: data as CrewColumnRow[] });
    },

    shareRelease: (albumId, shared) => {
      const sc = scope();
      const app = useAppStore.getState();
      const album = app.workspace.albums.find((a) => a.id === albumId);
      if (!sc || !album) return 0;
      if (!shared) {
        app.updateAlbum(albumId, { shared: false });
      } else {
        app.updateAlbum(albumId, { shared: true, shareId: album.shareId ?? uuid(), shareCrewId: sc.crewId, shareUserId: sc.userId });
      }
      // The workspace change above starts the sync (debounced), like songs.
      return shared ? get().setShared(album.trackPaths, true) : 0;
    },

    moveCrewCard: async (songId, columnId, beforeId) => {
      if (!supabase) return;
      const { cfg, onServer } = crewPipeline(get().columns);
      const move = crewMove(get().songs, cfg, onServer, songId, columnId, beforeId);
      if (move.kind === "none") return;
      if (move.kind === "stage") return get().moveCrewSong(songId, move.stage);
      const crewId = get().activeCrewId;
      const before = get().songs;
      const touched = [songId, ...move.renumber.map((r) => r.songId)];
      const stage = cfg.columns.find((c) => c.id === columnId)!.stage;
      // Optimistic: the move carries the version it was made on.
      set({ songs: applyCardMove(before, move, stage) });
      const undo = (e: unknown) => {
        // Only these cards, and only if this crew is still the one shown.
        if (get().activeCrewId === crewId) set({ songs: restoreSongs(get().songs, before, touched) });
        throw new Error(crewErrorMessage(e));
      };
      type Row = { applied: boolean; stage: SongStatus | null; stage_updated_at: string; stage_updated_by: string | null; column_id: string | null; board_order: number | null };
      const call = async (id: string, order: number, expected: string) => {
        const { data, error } = await supabase!.rpc("move_crew_card", { p_song: id, p_column: columnId, p_order: order, p_expected_at: expected });
        if (error) throw error;
        return (Array.isArray(data) ? data[0] : data) as Row;
      };
      let r: Row;
      try {
        r = await call(songId, move.order, move.expectedAt);
      } catch (e) {
        return undo(e);
      }
      if (get().activeCrewId !== crewId) return;
      const settle = (id: string, x: Row) =>
        set({ songs: get().songs.map((s) => (s.id === id ? { ...s, stage: x.stage, stage_updated_at: x.stage_updated_at, stage_updated_by: x.stage_updated_by, column_id: x.column_id, board_order: x.board_order } : s)) });
      settle(songId, r);
      applyRemoteMoves();
      if (!r.applied) {
        const who = get().members.find((m) => m.user_id === r.stage_updated_by)?.display_name ?? crewText("someone");
        if (get().activeCrewId === crewId) set({ songs: restoreSongs(get().songs, before, move.renumber.map((x) => x.songId)) });
        throw new Error(crewText("movedMeanwhile", undefined, { who, stage: statusInfo(r.stage ?? undefined).label }));
      }
      // Place the column's other cards so the card sits where it was dropped
      // (same stage: no version needed).
      for (const x of move.renumber) {
        const row = get().songs.find((s) => s.id === x.songId);
        if (!row) continue;
        try {
          settle(x.songId, await call(x.songId, x.order, row.stage_updated_at));
        } catch (e) {
          throw new Error(crewErrorMessage(e));
        }
      }
    },
  };
});

/** In a crew (signed in, with an active crew): crew features show. Otherwise
 * the app is the solo app (Launch Kit included; crew-only UI hidden). */
export function useInCrew(): boolean {
  return useCrewStore((s) => s.enabled && !!s.userId && !!s.activeCrewId && s.crews.some((c) => c.id === s.activeCrewId));
}
