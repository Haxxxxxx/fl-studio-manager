import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AiStatus,
  AudioAnalysis,
  CoverImage,
  CoverStatus,
  PackageResult,
  ProjectInfo,
  RenderEvent,
  Settings,
  Snippet,
  TemplateInfo,
  Workspace,
} from "../types";

export async function scanProjects(folders: string[], outputFolder: string | null): Promise<ProjectInfo[]> {
  return invoke("scan_projects", { folders, outputFolder });
}

export async function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: Settings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function getWorkspace(): Promise<Workspace | null> {
  return invoke("get_workspace");
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  return invoke("save_workspace", { workspace });
}

export async function detectFlStudio(): Promise<string | null> {
  return invoke("detect_fl_studio");
}

/** The first DAW projects folder found (FL Studio, Studio One, REAPER, Ableton, Cubase, Bitwig, Pro Tools defaults). */
export async function detectProjectsFolder(): Promise<string | null> {
  return invoke("detect_projects_folder");
}

export async function renderProjects(args: {
  projectPaths: string[];
  outputFolder: string;
  flStudioPath: string;
  format: string;
  outputNames?: string[];
}): Promise<void> {
  return invoke("render_projects", args);
}

export function onRenderProgress(
  handler: (event: RenderEvent) => void,
): Promise<UnlistenFn> {
  return listen<RenderEvent>("render-progress", (e) => handler(e.payload));
}

export async function listTemplates(flStudioPath: string | null): Promise<TemplateInfo[]> {
  return invoke("list_templates", { flStudioPath });
}

export async function defaultTemplate(flStudioPath: string | null): Promise<string | null> {
  return invoke("default_template", { flStudioPath });
}

export async function createProject(args: {
  templatePath: string;
  parentFolder: string;
  name: string;
}): Promise<string> {
  return invoke("create_project", args);
}

export async function duplicateProject(projectPath: string, newName: string): Promise<string> {
  return invoke("duplicate_project", { projectPath, newName });
}

export async function restoreBackup(backupPath: string, projectPath: string): Promise<string> {
  return invoke("restore_backup", { backupPath, projectPath });
}

export async function trashBackups(paths: string[]): Promise<number> {
  return invoke("trash_backups", { paths });
}

/** Zipped loop packages (.flp + samples, flat) — FL opens these directly. */
export async function packageProjects(args: {
  projectPaths: string[];
  outputFolder: string;
  subfolder?: string;
}): Promise<PackageResult[]> {
  return invoke("package_projects", args);
}

export function onPackageProgress(handler: (result: PackageResult) => void): Promise<UnlistenFn> {
  return listen<PackageResult>("package-progress", (e) => handler(e.payload));
}

/** Duration, loudness curve and the strongest snippets of a mixdown. */
export async function analyzeAudio(path: string, bpm: number | null): Promise<AudioAnalysis> {
  return invoke("analyze_audio", { path, bpm });
}

/** Writes `<outputFolder>/Launch Kits/<folderName>` (text files, master
 * copy, snippet clips). The folder name is sanitized on the Rust side. */
export async function exportLaunchKit(args: {
  outputFolder: string;
  folderName: string;
  files: { name: string; content: string }[];
  master: string | null;
  masterName: string;
  clips: Snippet[];
}): Promise<string> {
  return invoke("export_launch_kit", args);
}

/** Whether a Gemini key is set (never the key itself). */
export async function aiStatus(): Promise<AiStatus> {
  return invoke("ai_status");
}

/** Saves the Gemini key on this machine; null removes it. */
export async function setAiKey(key: string | null): Promise<void> {
  return invoke("set_ai_key", { key });
}

/** One structured Gemini call (retries and a backup model on the Rust
 * side): JSON matching `schema`, plus the model that actually answered. */
export async function aiGenerateJson(args: {
  model: string | null;
  system: string;
  prompt: string;
  schema: object;
  temperature: number;
}): Promise<{ model: string; data: unknown }> {
  return invoke("ai_generate_json", args);
}

export interface ShortsStatus {
  /** Where ffmpeg was found; null = not installed / not found. */
  path: string | null;
  encoder: string | null;
  error: string | null;
}

export async function shortsStatus(ffmpegPath: string | null): Promise<ShortsStatus> {
  return invoke("shorts_status", { ffmpegPath });
}

export interface ShortResult {
  label: string;
  path: string | null;
  error: string | null;
}

/** Renders 9:16 MP4s into `<outputFolder>/Launch Kits/<folderName>/shorts/`. */
export async function renderShorts(args: {
  ffmpegPath: string | null;
  master: string;
  clips: { label: string; startSec: number; lengthSec: number; layoutPng: string }[];
  outputFolder: string;
  folderName: string;
}): Promise<ShortResult[]> {
  return invoke("render_shorts", args);
}

/** Whether Cloudflare Workers AI credentials are set (never the values). */
export async function coverStatus(): Promise<CoverStatus> {
  return invoke("cover_status");
}

/** Saves the Cloudflare account ID + API token on this machine; both null
 * removes them. */
export async function setCoverCredentials(accountId: string | null, token: string | null): Promise<void> {
  return invoke("set_cover_credentials", { accountId, token });
}

/** One FLUX.1 [schnell] cover concept (retries on the Rust side). */
export async function generateCover(prompt: string, seed: number | null): Promise<CoverImage> {
  return invoke("generate_cover", { prompt, seed });
}

/** Writes `<outputFolder>/Launch Kits/<folderName>/cover-concept.jpg`. */
export async function saveCover(args: { outputFolder: string; folderName: string; imageB64: string }): Promise<string> {
  return invoke("save_cover", args);
}

export interface KitFile {
  path: string;
  /** Inside the kit folder, e.g. "snippets/Hook 15s.wav". */
  relative: string;
  sizeBytes: number;
}

/** What's in `<outputFolder>/Launch Kits/<folderName>/` (empty if never exported). */
export async function kitFiles(outputFolder: string, folderName: string): Promise<KitFile[]> {
  return invoke("kit_files", { outputFolder, folderName });
}

/** URL the webview can stream a local audio file from (asset protocol). */
export function audioSrc(path: string): string {
  return convertFileSrc(path);
}

export async function pickFolder(): Promise<string | null> {
  const result = await openDialog({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function pickExecutable(): Promise<string | null> {
  const result = await openDialog({ directory: false, multiple: false });
  return typeof result === "string" ? result : null;
}

/** Opens a DAW project in its app. Rust refuses network paths and non-projects. */
export async function openInFlStudio(path: string): Promise<void> {
  await invoke("open_project", { path });
}

/** Opens an https link in the default browser. */
export async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}

/** Shows a file in Finder / Explorer. Rust refuses network paths. */
export async function revealInFileManager(path: string): Promise<void> {
  await invoke("reveal_path", { path });
}
