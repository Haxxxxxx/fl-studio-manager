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
  /** Gemini model id; null = the default. */
  aiModel: string | null;
  /** Language for AI-written copy; null = English. */
  aiLanguage: string | null;
  /** ffmpeg for shorts; null = found automatically. */
  ffmpegPath: string | null;
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

/** The song lifecycle (docs/ROADMAP.md): one stage at a time. */
export type SongStatus = "creation" | "production" | "prep" | "release" | "promotion";

export interface SongMeta {
  status?: SongStatus;
  /** The stage before the lifecycle migration (idea/wip/mixing/mastering/done). */
  legacyStatus?: string;
  /** When the stage last changed (here or on the crew board), for sync. */
  stageUpdatedAtMs?: number;
  /** Shared with the crew (opt-in per song). */
  shared?: boolean;
  /** Stable id of this song in the crew database, set on first share. */
  shareId?: string;
  tags?: string[];
  notes?: string;
  /** Musical key, e.g. "Am", "F#". FL doesn't store one. */
  key?: string;
  /** Hidden from the library, board and stats (the yearly "clear out"). */
  archived?: boolean;
  credits?: Credit[];
  pitches?: Pitch[];
  launchKit?: LaunchKitMeta;
}

// ---- Launch Kit ----

export type KitFieldId =
  | "title"
  | "artists"
  | "producers"
  | "genre"
  | "bpm"
  | "key"
  | "duration"
  | "explicit"
  | "releaseDate"
  | "coverBrief"
  | "captions";

/** The user's side of a launch kit. Everything else is regenerated from the
 * project each time, so the .flp stays the source of truth. */
export interface LaunchKitMeta {
  /** Values the user typed over the generated ones. */
  edits?: Partial<Record<KitFieldId, string>>;
  /** Snippet label → start (s), when nudged off the detected spot. */
  snippetStarts?: Record<string, number>;
  /** Set by "Accept all"; cleared by any later edit. */
  acceptedAtMs?: number;
  ai?: KitAiMeta;
  /** The picked cover concept: small metadata only, never image bytes
   * (the image itself is cover-concept.jpg in the kit folder). */
  cover?: KitCoverMeta;
}

export interface KitCoverMeta {
  /** FLUX seed and prompt that made it, so "more like this" can follow up. */
  seed: number;
  prompt: string;
  /** Index into COVER_VARIANTS (src/lib/cover.ts). */
  variant: number;
  /** Where "Save to kit" wrote it, if it did. */
  savedPath?: string;
  savedAtMs?: number;
}

export interface AiFieldReview {
  verdict: "ok" | "check" | "wrong";
  /** How sure the model is of its verdict, 0–1. */
  confidence: number;
  reason: string;
  suggestion?: string;
  /** The value that was checked; a different current value = stale. */
  checkedValue: string;
}

export interface KitAiMeta {
  /** AI-written text, used unless the user edited the field. */
  drafts?: {
    captions: string;
    coverBrief: string;
    model: string;
    atMs: number;
    /** The facts the text was written for; if they change, it's outdated. */
    basis?: { title: string; artists: string; releaseDate: string };
  };
  review?: { fields: Partial<Record<KitFieldId, AiFieldReview>>; model: string; atMs: number };
}

export interface AiStatus {
  configured: boolean;
  source: "env" | "settings" | null;
  defaultModel: string;
}

/** Whether Cloudflare Workers AI credentials are set (never the values). */
export interface CoverStatus {
  configured: boolean;
  source: "env" | "settings" | null;
  model: string;
}

/** One FLUX concept, as returned by `generate_cover`. */
export interface CoverImage {
  /** Base64 JPEG. Kept in memory only, never in the workspace. */
  imageB64: string;
  seed: number;
  /** False if Cloudflare refused the seed (the image is unseeded). */
  seedApplied: boolean;
  width: number | null;
  height: number | null;
}

export interface Snippet {
  label: string;
  startSec: number;
  lengthSec: number;
}

export interface AudioAnalysis {
  durationSec: number;
  windowSec: number;
  /** Loudness per window, loudest = 1. */
  energy: number[];
  snippets: Snippet[];
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
  /** 2 = roadmap lifecycle stages (see migrateWorkspace). */
  version: 2;
  /** Keyed by .flp path. */
  songs: Record<string, SongMeta>;
  albums: Album[];
  people: Person[];
}

/** Whether the newest mixdown is newer than the last save of the project. */
export type RenderFreshness = "fresh" | "stale" | "none";

// ---- Crew (Supabase, EU) — rows as stored in supabase/migrations/*_crew.sql ----

export interface CrewCredit {
  name: string;
  role: string;
  split: number | null;
}

/** A song's shared metadata. Never audio, file paths, samples or notes. */
export interface CrewSongRow {
  id: string;
  crew_id: string;
  owner_id: string;
  title: string;
  stage: SongStatus | null;
  bpm: number | null;
  musical_key: string | null;
  tags: string[];
  credits: CrewCredit[];
  release_date: string | null;
  has_mixdown: boolean;
  kit_accepted: boolean;
  last_saved_at: string | null;
  stage_updated_at: string;
  stage_updated_by?: string | null;
  updated_at?: string;
}

export interface CrewMemberRow {
  crew_id: string;
  user_id: string;
  display_name: string;
  role: "owner" | "member";
  joined_at?: string;
}

export interface CrewSummary {
  id: string;
  name: string;
  role: "owner" | "member";
  displayName: string;
}
