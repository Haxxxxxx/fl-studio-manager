import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ProjectInfo, RenderEvent, Settings } from "../types";

export async function scanProjects(folders: string[]): Promise<ProjectInfo[]> {
  return invoke("scan_projects", { folders });
}

export async function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: Settings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function detectFlStudio(): Promise<string | null> {
  return invoke("detect_fl_studio");
}

export async function renderProjects(args: {
  projectPaths: string[];
  outputFolder: string;
  flStudioPath: string;
  format: string;
}): Promise<void> {
  return invoke("render_projects", args);
}

export function onRenderProgress(
  handler: (event: RenderEvent) => void,
): Promise<UnlistenFn> {
  return listen<RenderEvent>("render-progress", (e) => handler(e.payload));
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
