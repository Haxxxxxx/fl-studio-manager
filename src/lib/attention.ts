import type { ProjectInfo, SongStatus, Workspace } from "../types";
import { isFinished, missingPlugins, missingSamples, renderFreshness } from "./songs";

// The dashboard's "Needs attention" carousel: songs with something to fix,
// and why. Stalled songs live on the crew cards, not here.

export type AttentionKind = "stale-mixdown" | "no-mixdown" | "missing-samples" | "missing-plugins";

export interface AttentionReason {
  kind: AttentionKind;
  text: string;
}

export interface AttentionItem {
  song: ProjectInfo;
  status: SongStatus | undefined;
  reasons: AttentionReason[];
  /** Last save of the project (or its newest mixdown). */
  lastActivityMs: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why a song needs attention, most urgent first; empty if it doesn't. */
export function attentionReasons(song: ProjectInfo, status: SongStatus | undefined): AttentionReason[] {
  const reasons: AttentionReason[] = [];
  const freshness = renderFreshness(song);
  if (isFinished(status) && freshness === "none") reasons.push({ kind: "no-mixdown", text: "Finished, but no mixdown yet" });
  if (freshness === "stale") reasons.push({ kind: "stale-mixdown", text: "Mixdown is older than the project" });
  const samples = missingSamples(song).length;
  if (samples) reasons.push({ kind: "missing-samples", text: `${plural(samples, "sample")} missing` });
  const plugins = missingPlugins(song).length;
  if (plugins) reasons.push({ kind: "missing-plugins", text: `${plural(plugins, "plugin")} not installed here` });
  return reasons;
}

const RANK: Record<AttentionKind, number> = { "no-mixdown": 0, "stale-mixdown": 1, "missing-samples": 2, "missing-plugins": 3 };

/** Songs needing attention: the most urgent reason first, then the most recently worked on. */
export function attentionItems(songs: ProjectInfo[], ws: Workspace): AttentionItem[] {
  return songs
    .map((song) => {
      const status = ws.songs[song.path]?.status;
      const lastActivityMs = Math.max(song.modifiedAtMs, ...song.renders.map((r) => r.modifiedAtMs));
      return { song, status, reasons: attentionReasons(song, status), lastActivityMs };
    })
    .filter((i) => i.reasons.length > 0)
    .sort((a, b) => RANK[a.reasons[0].kind] - RANK[b.reasons[0].kind] || b.lastActivityMs - a.lastActivityMs);
}
