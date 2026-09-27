export interface ProjectInfo {
  path: string;
  name: string;
  folder: string;
  sizeBytes: number;
  modifiedAtMs: number;
  root: string;
  // Read directly out of the .flp binary (best-effort — see
  // src-tauri/src/flp_metadata.rs). Any of these can be absent: older
  // projects, or projects where the field was simply never filled in.
  genre: string | null;
  artist: string | null;
  tempoBpm: number | null;
  timeSigNum: number | null;
  timeSigDenom: number | null;
  flVersion: string | null;
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
