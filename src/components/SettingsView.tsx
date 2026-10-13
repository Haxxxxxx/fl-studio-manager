import { useState } from "react";
import { FolderPlus, Trash2, Wand2, FileSearch, PlayCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import type { AiProvider, AiProviderChoice, AiProviderStatus, RenderFormat } from "../types";

const IS_MAC = navigator.userAgent.includes("Mac");

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
  const startRender = useAppStore((s) => s.startRender);
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
    const sample = projects.find((p) => !p.isTemplate);
    if (!sample) {
      setTestState({
        status: "error",
        message: "Link a project folder with at least one .flp to test with.",
      });
      return;
    }
    setTestState({ status: "running" });
    try {
      // Through the store, so the render panel and the "already rendering"
      // guard see it like any other export.
      await startRender([sample.path]);
      const job = useAppStore.getState().renderJobs.get(sample.path);
      if (job?.status === "done" && job.outputPath) {
        setTestState({ status: "done", path: job.outputPath });
      } else {
        setTestState({ status: "error", message: job?.message ?? "Render failed" });
      }
    } catch (e) {
      setTestState({ status: "error", message: e instanceof Error ? e.message : String(e) });
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

        <AiSettings />

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
          {IS_MAC && (
            <p className="mt-1 text-xs text-amber-300/80">
              Only verified on Windows so far. If FL Studio opens normally instead of rendering, quit it — the
              render gives up after 15 minutes.
            </p>
          )}
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

const AI_LANGUAGES = ["English", "French", "Spanish", "German", "Portuguese", "Italian"];
const field =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-orange-400/50 focus:outline-none";

/** One provider's key: status, write-only input, save/remove. */
function ProviderKey({
  provider,
  label,
  envVar,
  placeholder,
  status,
}: {
  provider: AiProvider;
  label: string;
  envVar: string;
  placeholder: string;
  status: AiProviderStatus | undefined;
}) {
  const refreshAiStatus = useAppStore((s) => s.refreshAiStatus);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function saveKey(value: string | null) {
    setMessage(null);
    try {
      await api.setAiKey(value, provider);
      await refreshAiStatus();
      setKey("");
      setMessage({ kind: "ok", text: value ? "Key saved on this computer." : "Key removed." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-white/70">{label}</span>
        <span className={status?.configured ? "text-emerald-300" : "text-white/40"}>
          {!status?.configured ? "No key" : status.source === "env" ? `Using ${envVar}` : "Key saved"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={status?.configured ? "Paste a new key to replace it" : placeholder}
          autoComplete="off"
          spellCheck={false}
          className={field}
        />
        <button onClick={() => saveKey(key)} disabled={!key.trim()} className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-400 disabled:opacity-40">
          Save
        </button>
        {status?.source === "settings" && (
          <button onClick={() => saveKey(null)} className="rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/5">
            Remove
          </button>
        )}
      </div>
      {message && <div className={`mt-1 text-xs ${message.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>{message.text}</div>}
    </div>
  );
}

const PROVIDER_CHOICES: { id: AiProviderChoice; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "claude", label: "Claude" },
  { id: "gemini", label: "Gemini" },
];

/** Provider choice, keys (write-only from here), models and copy language. */
function AiSettings() {
  const aiStatus = useAppStore((s) => s.aiStatus);
  const refreshAiStatus = useAppStore((s) => s.refreshAiStatus);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const choice = settings.aiProvider ?? "auto";

  async function choose(id: AiProviderChoice) {
    await updateSettings({ aiProvider: id === "auto" ? null : id });
    await refreshAiStatus();
  }

  const active = aiStatus?.provider;
  const activeLine = !active
    ? "Off: add a key below."
    : `${active === "claude" ? "Claude" : "Gemini"} answers${choice === "auto" ? ` (auto: ${aiStatus?.devBuild ? "dev build" : "release build"})` : ""}${aiStatus?.configured ? "" : ", but it has no key yet"}.`;

  return (
    <section>
      <h2 className="text-sm font-semibold text-white/90">AI (Launch Kit drafts and checks)</h2>
      <p className="mt-1 text-xs text-white/40">
        Everything works without AI; it only adds drafts and a second opinion. <b className="font-medium text-white/60">Auto</b> uses Claude
        while developing (<code className="rounded bg-white/10 px-1">npm run tauri dev</code>) so dev sessions don't use up the free Gemini
        quota, and Gemini (free) in the released app.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex rounded-md border border-white/10 p-0.5">
          {PROVIDER_CHOICES.map((p) => (
            <button
              key={p.id}
              onClick={() => choose(p.id)}
              className={`rounded px-3 py-1 text-xs ${choice === p.id ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className={`text-xs ${aiStatus?.configured ? "text-emerald-300" : "text-white/50"}`}>{activeLine}</span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <ProviderKey
          provider="claude"
          label="Anthropic API key (Claude, for development; paid per use)"
          envVar="ANTHROPIC_API_KEY"
          placeholder="Paste your Anthropic API key (console.anthropic.com)"
          status={aiStatus?.claude}
        />
        <ProviderKey
          provider="gemini"
          label="Gemini API key (free tier, for the released app)"
          envVar="GEMINI_API_KEY"
          placeholder="Paste your Gemini API key"
          status={aiStatus?.gemini}
        />
        <p className="text-[11px] text-white/35">
          Free Gemini key:{" "}
          <button onClick={() => api.openExternal("https://aistudio.google.com/apikey")} className="text-orange-300 underline">
            aistudio.google.com/apikey
          </button>
          . Anthropic key:{" "}
          <button onClick={() => api.openExternal("https://console.anthropic.com/settings/keys")} className="text-orange-300 underline">
            console.anthropic.com
          </button>{" "}
          (needs billing).
        </p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <label className="text-xs text-white/50">
          Claude model
          <input
            defaultValue={settings.claudeModel ?? ""}
            onBlur={(e) => updateSettings({ claudeModel: e.target.value.trim() || null })}
            placeholder={aiStatus?.claude.defaultModel ?? "claude-opus-5-5"}
            className={`${field} mt-1`}
          />
        </label>
        <label className="text-xs text-white/50">
          Gemini model
          <input
            defaultValue={settings.aiModel ?? ""}
            onBlur={(e) => updateSettings({ aiModel: e.target.value.trim() || null })}
            placeholder={aiStatus?.gemini.defaultModel ?? "gemini-3.8-flash"}
            className={`${field} mt-1`}
          />
        </label>
        <label className="text-xs text-white/50">
          Language for captions and briefs
          <select
            value={settings.aiLanguage ?? "English"}
            onChange={(e) => updateSettings({ aiLanguage: e.target.value === "English" ? null : e.target.value })}
            className={`${field} mt-1`}
          >
            {AI_LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/30">
        Keys stay on this computer (their own file in the app config folder, not settings.json) and are never shown again. AI calls send
        the song name, tags, notes, mixer track names, credits and kit fields, never audio or file paths. On Gemini's free tier Google may
        use them to improve its products. Claude is billed to your Anthropic account (claude-haiku-5-5 is the cheapest option).
      </p>
    </section>
  );
}
