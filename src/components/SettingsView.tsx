import { useState } from "react";
import { FolderPlus, Trash2, Wand2, FileSearch, PlayCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import type { RenderFormat } from "../types";

const FORMATS: { id: RenderFormat; label: string }[] = [
  { id: "wav", label: "WAV" },
  { id: "mp3", label: "MP3" },
  { id: "ogg", label: "OGG" },
];

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addWatchedFolder = useAppStore((s) => s.addWatchedFolder);
  const removeWatchedFolder = useAppStore((s) => s.removeWatchedFolder);
  const projects = useAppStore((s) => s.projects);
  const demoMode = useAppStore((s) => s.demoMode);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const exitDemoMode = useAppStore((s) => s.exitDemoMode);
  const [detecting, setDetecting] = useState(false);
  const [testState, setTestState] = useState<
    { status: "idle" } | { status: "running" } | { status: "done"; path: string } | { status: "error"; message: string }
  >({ status: "idle" });

  async function handleDetect() {
    setDetecting(true);
    try {
      const path = await api.detectFlStudio();
      if (path) {
        await updateSettings({ flStudioPath: path });
      }
    } finally {
      setDetecting(false);
    }
  }

  async function handleBrowseExecutable() {
    const path = await api.pickExecutable();
    if (path) await updateSettings({ flStudioPath: path });
  }

  async function handleBrowseOutput() {
    const folder = await api.pickFolder();
    if (folder) await updateSettings({ outputFolder: folder });
  }

  async function handleTestRender() {
    if (!settings.flStudioPath || !settings.outputFolder) {
      setTestState({
        status: "error",
        message: "Set both the FL Studio path and output folder first.",
      });
      return;
    }
    const sample = projects[0];
    if (!sample) {
      setTestState({
        status: "error",
        message: "Link a project folder with at least one .flp to test with.",
      });
      return;
    }
    setTestState({ status: "running" });
    const unlisten = await api.onRenderProgress((event) => {
      if (event.projectPath !== sample.path) return;
      if (event.status === "done" && event.outputPath) {
        setTestState({ status: "done", path: event.outputPath });
        unlisten();
      } else if (event.status === "error") {
        setTestState({ status: "error", message: event.message ?? "Render failed" });
        unlisten();
      }
    });
    try {
      await api.renderProjects({
        projectPaths: [sample.path],
        outputFolder: settings.outputFolder,
        flStudioPath: settings.flStudioPath,
        format: settings.renderFormat,
      });
    } catch (e) {
      setTestState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      unlisten();
    }
  }

  return (
    <div className="flex-1 overflow-auto px-8 py-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <section className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white/90">Sample data</h2>
            <p className="mt-0.5 text-xs text-white/40">
              Preview the dashboard and library filled with generated projects
              — no real folder needed.
            </p>
          </div>
          <button
            onClick={demoMode ? exitDemoMode : loadDemoData}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${
              demoMode
                ? "border border-white/15 text-white/70 hover:bg-white/5"
                : "bg-orange-500 text-white hover:bg-orange-400"
            }`}
          >
            {demoMode ? "Exit sample data" : "Load sample data"}
          </button>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white/90">Project folders</h2>
          <p className="mt-1 text-xs text-white/40">
            FL Manager scans these folders (recursively) for .flp files.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {settings.watchedFolders.map((folder) => (
              <div
                key={folder}
                className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70"
              >
                <span className="truncate">{folder}</span>
                <button
                  onClick={() => removeWatchedFolder(folder)}
                  className="shrink-0 rounded p-1 text-white/30 hover:bg-white/10 hover:text-red-300"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={addWatchedFolder}
              className="flex items-center justify-center gap-2 rounded-md border border-dashed border-white/15 py-2.5 text-sm text-white/50 hover:border-orange-400/40 hover:text-orange-300"
            >
              <FolderPlus size={15} />
              Add project folder
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white/90">FL Studio executable</h2>
          <p className="mt-1 text-xs text-white/40">
            Used to run FL Studio's command-line renderer for batch export.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={settings.flStudioPath ?? ""}
              placeholder="Not set"
              className="flex-1 truncate rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 placeholder:text-white/30"
            />
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              <Wand2 size={14} />
              {detecting ? "Detecting..." : "Auto-detect"}
            </button>
            <button
              onClick={handleBrowseExecutable}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              <FileSearch size={14} />
              Browse
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-white/90">Export</h2>
          <p className="mt-1 text-xs text-white/40">
            Where rendered mixdowns go, and in what format.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={settings.outputFolder ?? ""}
              placeholder="Not set"
              className="flex-1 truncate rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 placeholder:text-white/30"
            />
            <button
              onClick={handleBrowseOutput}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
            >
              <FileSearch size={14} />
              Browse
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => updateSettings({ renderFormat: f.id })}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  settings.renderFormat === f.id
                    ? "border-orange-400/50 bg-orange-500/15 text-orange-300"
                    : "border-white/10 text-white/60 hover:bg-white/5"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-sm font-semibold text-white/90">Test render</h2>
          <p className="mt-1 text-xs text-white/40">
            FL Studio's command-line renderer is a community-verified, lightly
            documented feature. Run one test render on a real project before
            trusting a big batch export.
          </p>
          <button
            onClick={handleTestRender}
            disabled={testState.status === "running" || demoMode}
            className="mt-3 flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/15 disabled:opacity-50"
          >
            <PlayCircle size={15} />
            {testState.status === "running" ? "Rendering..." : "Render most recent project"}
          </button>
          {demoMode && (
            <div className="mt-2 text-xs text-white/30">
              Disabled while viewing sample data — link a real folder first.
            </div>
          )}
          {testState.status === "done" && (
            <div className="mt-2 text-xs text-emerald-400">
              Success — output saved to {testState.path}
            </div>
          )}
          {testState.status === "error" && (
            <div className="mt-2 text-xs text-red-300">{testState.message}</div>
          )}
        </section>
      </div>
    </div>
  );
}
