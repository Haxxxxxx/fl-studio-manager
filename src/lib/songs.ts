import type { Album, ProjectInfo, RenderFreshness, SongStatus, Workspace } from "../types";

// Pipeline stages are ordinal, so they share one hue stepped dark → light
// (validated with validate_palette.js --ordinal against the #16161b surface).
// Songs nobody has triaged yet sit in neutral gray, outside the ramp.
export const STATUSES: { id: SongStatus; label: string; color: string }[] = [
  { id: "idea", label: "Idea", color: "#1c5cab" },
  { id: "wip", label: "In progress", color: "#2a78d6" },
  { id: "mixing", label: "Mixing", color: "#5598e7" },
  { id: "mastering", label: "Mastering", color: "#86b6ef" },
  { id: "done", label: "Done", color: "#b7d3f6" },
];
export const UNSORTED = { label: "Unsorted", color: "#5b5b63" };

export function statusInfo(status: SongStatus | undefined) {
  return STATUSES.find((s) => s.id === status) ?? { id: undefined, ...UNSORTED };
}

// Album cover colors — the dark categorical slots, in fixed order.
export const ALBUM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9", "#e66767"];

export const EMPTY_WORKSPACE: Workspace = { version: 1, songs: {}, albums: [] };

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
  return [p.modifiedAtMs, ...p.backups.map((b) => b.modifiedAtMs)];
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
