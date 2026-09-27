export interface ProjectInfo {
  path: string;
  name: string;
  folder: string;
  sizeBytes: number;
  modifiedAtMs: number;
  root: string;
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
