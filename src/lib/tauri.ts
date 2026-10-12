import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AiStatus,
  AudioAnalysis,
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

/** FL's default `Documents/Image-Line/FL Studio/Projects`, if it exists. */
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

/** Writes the kit folder (text files, master copy, snippet clips). */
export async function exportLaunchKit(args: {
  outDir: string;
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

/** One structured Gemini call: JSON matching `schema` comes back. */
export async function aiGenerateJson(args: {
  model: string | null;
  system: string;
  prompt: string;
  schema: object;
  temperature: number;
}): Promise<unknown> {
  return invoke("ai_generate_json", args);
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

export async function openInFlStudio(path: string): Promise<void> {
  await openPath(path);
}

/** Opens an https link in the default browser. */
export async function openExternal(url: string): Promise<void> {
  await openUrl(url);
}

export async function revealInFileManager(path: string): Promise<void> {
  await revealItemInDir(path);
}
