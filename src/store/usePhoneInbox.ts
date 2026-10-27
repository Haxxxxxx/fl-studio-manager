import { create } from "zustand";
import * as api from "../lib/tauri";
import { appendIdea, newCount, targetKey } from "../lib/phoneInbox";
import { useAppStore } from "./useAppStore";
import type { InboxItem, InboxTarget } from "../types";

// The phone inbox on the desktop (docs/PHONE-SYNC.md v1.1). Rust holds the
// items and files; this mirrors the list, refreshes when Rust says
// something arrived (`phone-inbox-changed`), and files things: ideas into
// notes (through the same store actions as the editors), memos into a song's
// folder or onto a beat/prod, sketches into a new song folder.

interface InboxState {
  items: InboxItem[];
  receiving: number;
  loaded: boolean;
  error: string | null;
  /** Phone sync is on / how many phones are paired (the menu entry shows when either). */
  syncOn: boolean;
  paired: number;
  refresh: () => Promise<void>;
  /** Appends the idea to the target's note, then marks it filed. */
  fileIdea: (item: InboxItem, target: InboxTarget) => Promise<void>;
  /** Song: copied into its "Voice memos" folder. Beat/prod: linked. */
  attachMemo: (item: InboxItem, target: InboxTarget) => Promise<void>;
  /** A new sketch song from the item's audio; returns its key. */
  fileSketch: (item: InboxItem, parentFolder: string, name: string, bandlabUrl?: string) => Promise<string>;
  dismiss: (item: InboxItem) => Promise<void>;
  restore: (item: InboxItem) => Promise<void>;
  remove: (item: InboxItem) => Promise<void>;
}

const SAMPLE = "This is sample data: switch to your library first.";

function currentNote(target: InboxTarget): string | null {
  const s = useAppStore.getState();
  if (target.kind === "song") return s.projects.some((p) => p.path === target.id) ? (s.workspace.songs[target.id]?.notes ?? "") : null;
  if (target.kind === "beat") return s.workspace.beatNotes?.[target.id] ?? "";
  return s.workspace.leadNotes?.[target.id] ?? "";
}

export const usePhoneInbox = create<InboxState>((set, get) => {
  async function after<T>(work: Promise<T>): Promise<T> {
    const out = await work;
    await get().refresh();
    return out;
  }

  return {
    items: [],
    receiving: 0,
    loaded: false,
    error: null,
    syncOn: false,
    paired: 0,

    refresh: async () => {
      try {
        const [list, status] = await Promise.all([api.phoneInboxList(), api.phoneSyncStatus().catch(() => null)]);
        set({
          items: list.items,
          receiving: list.receiving,
          loaded: true,
          error: null,
          syncOn: status?.on ?? false,
          paired: status?.devices.filter((d) => d.lastSeenMs !== null).length ?? 0,
        });
      } catch (e) {
        set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
      }
    },

    fileIdea: async (item, target) => {
      const app = useAppStore.getState();
      if (app.demoMode) throw new Error(SAMPLE);
      if (!app.workspaceWritable) throw new Error("Your workspace isn't loaded yet: try again in a moment.");
      const note = currentNote(target);
      if (note === null) throw new Error("That song isn't in the Library any more: pick another.");
      const r = appendIdea(note, item);
      if (!r.ok) throw new Error(r.reason === "full" ? "That note is full (20,000 characters): pick another or make room." : "This idea is empty.");
      if (target.kind === "song") app.updateSong(target.id, { notes: r.text });
      else if (target.kind === "beat") app.setBeatNote(target.id, r.text);
      else app.setLeadNote(target.id, r.text);
      await after(api.phoneInboxMark(item.id, "filed", targetKey(target)));
    },

    attachMemo: async (item, target) => {
      if (useAppStore.getState().demoMode) throw new Error(SAMPLE);
      if (target.kind === "song") {
        await after(api.phoneInboxAttachSong(item.id, target.id));
        return;
      }
      await after(api.phoneInboxMark(item.id, "filed", targetKey(target)));
    },

    fileSketch: async (item, parentFolder, name, bandlabUrl) => {
      const key = await useAppStore.getState().fileInboxSketch({ itemId: item.id, parentFolder, name, bandlabUrl });
      await get().refresh();
      return key;
    },

    dismiss: (item) => after(api.phoneInboxMark(item.id, "dismissed")),
    restore: (item) => after(api.phoneInboxMark(item.id, "new")),
    remove: (item) => after(api.phoneInboxRemove(item.id)),
  };
});

export const useInboxNewCount = () => usePhoneInbox((s) => newCount(s.items));

/** Loads the list and keeps it fresh; returns the stop function. */
export function startPhoneInbox(): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;
  void usePhoneInbox.getState().refresh();
  api
    .onPhoneInboxChanged(() => void usePhoneInbox.getState().refresh())
    .then((u) => {
      if (stopped) u();
      else unlisten = u;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    unlisten?.();
  };
}
