import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { PackageResult, ProjectInfo, RenderEvent, Settings, TemplateInfo, Workspace } from "../types";

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

export async function revealInFileManager(path: string): Promise<void> {
  await revealItemInDir(path);
}
