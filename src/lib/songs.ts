import type { Album, ProjectInfo, RenderFreshness, SongStatus, Workspace } from "../types";

// The song lifecycle from docs/ROADMAP.md: every track is in exactly one
// stage. Stages are ordinal, so they share one blue stepped dark → light
// (System 02's stage ramp, lit as LEDs on the #161614 panel).
// Songs nobody has triaged yet sit in neutral gray, outside the ramp.
export const STATUSES: { id: SongStatus; label: string; color: string; hint: string }[] = [
  { id: "creation", label: "Creation", color: "#1C5CAB", hint: "Beat and lyrics exist, still rough" },
  { id: "production", label: "Production", color: "#2A78D6", hint: "Recording, mixing, mastering until final" },
  { id: "prep", label: "Prep", color: "#5598E7", hint: "Cover, metadata, release date, distributor" },
  { id: "release", label: "Release", color: "#86B6EF", hint: "Release day" },
  { id: "promotion", label: "Promotion", color: "#B7D3F6", hint: "Posts, reels, stories, follow-up" },
];
export const UNSORTED = { label: "Unsorted", color: "#5B5B63", hint: "Not placed in a stage yet" };

export function statusInfo(status: SongStatus | undefined) {
  return STATUSES.find((s) => s.id === status) ?? { id: undefined, ...UNSORTED };
}

/** The music itself is final: Prep, Release or Promotion. */
export function isFinished(status: SongStatus | undefined): boolean {
  return status === "prep" || status === "release" || status === "promotion";
}

/** For "closest to release first" ordering: Promotion 0 … Creation 4, unsorted 5. */
export function stageRank(status: SongStatus | undefined): number {
  const i = STATUSES.findIndex((s) => s.id === status);
  return i < 0 ? STATUSES.length : STATUSES.length - 1 - i;
}

/** The app's first stages (version 1) → the roadmap lifecycle (version 2). */
const LEGACY_STAGES: Record<string, SongStatus> = {
  idea: "creation",
  wip: "creation",
  mixing: "production",
  mastering: "production",
  done: "prep",
};

/** Upgrades a stored workspace to the current version. Each migrated song
 * keeps its old stage in `legacyStatus`, so nothing is lost. */
export function migrateWorkspace(stored: Workspace | { version?: number }): { workspace: Workspace; changed: boolean } {
  const ws = { ...EMPTY_WORKSPACE, ...(stored as Workspace) };
  if (ws.version === 2) return { workspace: ws, changed: false };
  const songs: Workspace["songs"] = {};
  for (const [path, meta] of Object.entries(ws.songs ?? {})) {
    const old = meta.status as string | undefined;
    songs[path] = old && LEGACY_STAGES[old] ? { ...meta, status: LEGACY_STAGES[old], legacyStatus: old } : meta;
  }
  return { workspace: { ...ws, version: 2, songs }, changed: true };
}

// Album cover colors — the dark categorical slots, in fixed order.
// Release swatches avoid blue (the stage ramp) and the hot orange (actions).
export const ALBUM_COLORS = ["#c98500", "#199e70", "#d55181", "#9085e9", "#e66767", "#8a9a5b", "#b8742a"];

export const EMPTY_WORKSPACE: Workspace = { version: 2, songs: {}, albums: [], people: [] };

export function renderFreshness(p: ProjectInfo): RenderFreshness {
  const latest = p.renders[0];
  if (!latest) return "none";
  return latest.modifiedAtMs >= p.modifiedAtMs ? "fresh" : "stale";
}

export function backupsBytes(p: ProjectInfo): number {
  return p.backups.reduce((sum, b) => sum + b.sizeBytes, 0);
}

export function rendersBytes(p: ProjectInfo): number {
  return p.renders.reduce((sum, r) => sum + r.sizeBytes, 0);
}

export function albumsOf(workspace: Workspace, path: string): Album[] {
  return workspace.albums.filter((a) => a.trackPaths.includes(path));
}

export function folderLabel(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

export function formatBpm(bpm: number | null): string {
  return bpm == null ? "—" : `${bpm % 1 === 0 ? bpm : bpm.toFixed(1)}`;
}

/** Every save FL recorded for a song: the current file plus each backup. */
export function saveTimestamps(p: ProjectInfo): number[] {
  return [p.modifiedAtMs, ...(p.backups ?? []).map((b) => b.modifiedAtMs)];
}

/** The latest save, backups included: FL's autosave and save-backups land in
 * the Backup folder, so the project file alone can look weeks old while the
 * song was worked on yesterday. 0 = unknown. */
export function lastSaveMs(p: ProjectInfo): number {
  return Math.max(0, ...saveTimestamps(p).filter((t) => Number.isFinite(t) && t > 0));
}

export function missingPlugins(p: ProjectInfo) {
  return p.plugins.filter((x) => x.installed === false);
}

export function missingSamples(p: ProjectInfo) {
  return p.samples.filter((s) => s.status === "missing");
}

/** A song that won't open cleanly on this machine. */
export function hasProblems(p: ProjectInfo): boolean {
  return missingPlugins(p).length > 0 || missingSamples(p).length > 0;
}

/** Song name, plus its folder when another song has the same name
 * (e.g. two "Ft Le Q" projects in different folders). */
export function songLabel(p: ProjectInfo, all: ProjectInfo[]): string {
  const clash = all.some((o) => o !== p && o.name.toLowerCase() === p.name.toLowerCase());
  return clash ? `${p.name} (${folderLabel(p.folder)})` : p.name;
}

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
/** All 24 keys, majors then minors ("C", …, "Cm", …). */
export const KEYS = [...NOTES, ...NOTES.map((n) => `${n}m`)];

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
