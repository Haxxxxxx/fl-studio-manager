export interface FileEntry {
  path: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

/** One song: the main .flp plus what FL keeps around it (see scanner.rs). */
export interface ProjectInfo {
  path: string;
  name: string;
  folder: string;
  sizeBytes: number;
  modifiedAtMs: number;
  root: string;
  // Read directly out of the .flp binary (best-effort — see
  // src-tauri/src/flp_metadata.rs). Empty/untrusted values come back null.
  genre: string | null;
  artist: string | null;
  tempoBpm: number | null;
  timeSigNum: number | null;
  timeSigDenom: number | null;
  flVersion: string | null;
  isTemplate: boolean;
  /** FL's auto-backups of this project, newest first. */
  backups: FileEntry[];
  /** Mixdowns next to the .flp (e.g. Envy.wav), newest first. */
  renders: FileEntry[];
  recordingsCount: number;
  recordingsBytes: number;
  plugins: PluginInfo[];
  samples: SampleInfo[];
  /** Named mixer tracks + recorded-take labels ("Lead Voices - Nova"). */
  trackNames: string[];
}

export interface PluginInfo {
  name: string;
  vendor: string | null;
  /** Third-party only; null for FL's native plugins. */
  installed: boolean | null;
}

/** ok = where the project says; relocated = found by name in the song's
 * folder (project was moved, FL can usually find it); missing = gone. */
export type SampleStatus = "ok" | "relocated" | "missing";

export interface SampleInfo {
  path: string;
  status: SampleStatus;
}

export interface TemplateInfo {
  name: string;
  category: string;
  path: string;
}

export interface Settings {
  watchedFolders: string[];
  flStudioPath: string | null;
  outputFolder: string | null;
  renderFormat: RenderFormat;
  favorites: string[];
}

export type RenderFormat = "wav" | "mp3" | "ogg";

export type RenderStatus = "queued" | "rendering" | "done" | "error";

export interface RenderEvent {
  projectPath: string;
  projectName: string;
  status: RenderStatus;
  message: string | null;
  outputPath: string | null;
}

// ---- Workspace: the app's own data, which FL Studio doesn't store ----

export type SongStatus = "idea" | "wip" | "mixing" | "mastering" | "done";

export interface SongMeta {
  status?: SongStatus;
  tags?: string[];
  notes?: string;
  /** Musical key, e.g. "Am", "F#". FL doesn't store one. */
  key?: string;
  /** Hidden from the library, board and stats (the yearly "clear out"). */
  archived?: boolean;
  credits?: Credit[];
  pitches?: Pitch[];
}

/** A collaborator or contact. Aliases are how they appear in track names
 * ("NV", "Novah" for Nova). */
export interface Person {
  id: string;
  name: string;
  aliases: string[];
  contact: string;
  notes: string;
}

export interface Credit {
  personId: string;
  role: string;
  /** Percentage share, if agreed. */
  split?: number;
}

export type PitchOutcome = "sent" | "listened" | "interested" | "placed" | "sold" | "passed";

/** "Sent this beat to X on date — what happened." */
export interface Pitch {
  id: string;
  personId: string;
  /** yyyy-mm-dd */
  date: string;
  outcome: PitchOutcome;
  note?: string;
}

export interface PackageResult {
  projectPath: string;
  zipPath: string | null;
  bytes: number;
  included: number;
  missing: string[];
  error: string | null;
}

export type AlbumKind = "album" | "ep" | "single" | "mixtape";

export interface Album {
  id: string;
  title: string;
  kind: AlbumKind;
  color: string;
  /** ISO date (yyyy-mm-dd), or null if no target date yet. */
  releaseDate: string | null;
  notes: string;
  /** Ordered tracklist, by .flp path. */
  trackPaths: string[];
  createdAtMs: number;
}

export interface Workspace {
  version: 1;
  /** Keyed by .flp path. */
  songs: Record<string, SongMeta>;
  albums: Album[];
  people: Person[];
}

/** Whether the newest mixdown is newer than the last save of the project. */
export type RenderFreshness = "fresh" | "stale" | "none";
