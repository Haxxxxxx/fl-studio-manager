import { useEffect, useState } from "react";
import { FolderPlus, Trash2, Wand2, FileSearch, PlayCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { CrewPanel } from "./CrewPanel";
import { canRenderInApp } from "../lib/daws";
import type { RenderFormat } from "../types";

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
    // The test drives FL Studio, so it needs an FL project, whatever else is linked.
    const sample = projects.find((p) => !p.isTemplate && canRenderInApp(p));
    if (!sample) {
      setTestState({
        status: "error",
        message: "The test render needs an FL Studio project (.flp). None was found in your linked folders.",
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
        <section className="flex items-center justify-between rounded-lg border border-rule bg-panel px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-cream">Sample data</h2>
            <p className="mt-0.5 text-xs text-engrave">
              Preview the dashboard and library filled with generated projects
              — no real folder needed.
            </p>
          </div>
          <button
            onClick={demoMode ? exitDemoMode : loadDemoData}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${
              demoMode
                ? "border border-rule-strong text-body hover:bg-raised"
                : "bg-orange-500 text-chassis hover:bg-orange-400"
            }`}
          >
            {demoMode ? "Exit sample data" : "Load sample data"}
          </button>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-cream">Project folders</h2>
          <p className="mt-1 text-xs text-engrave">
            Hivo scans these folders (recursively) for projects from FL Studio, Ableton Live, REAPER, Studio One, Pro Tools, Cubase and Bitwig.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {settings.watchedFolders.map((folder) => (
              <div
                key={folder}
                className="flex items-center justify-between gap-2 rounded-md border border-rule bg-raised px-3 py-2 text-sm text-body"
              >
                <span className="truncate">{folder}</span>
                <button
                  onClick={() => removeWatchedFolder(folder)}
                  className="shrink-0 rounded p-1 text-engrave hover:bg-rule hover:text-red-300"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              onClick={addWatchedFolder}
              className="flex items-center justify-center gap-2 rounded-md border border-dashed border-rule-strong py-2.5 text-sm text-engrave hover:border-orange-400/40 hover:text-orange-300"
            >
              <FolderPlus size={15} />
              Add project folder
            </button>
          </div>
        </section>

        <CrewPanel />

        <AiSettings />

        <ShortsSettings />

        <CoverSettings />

        <section>
          <h2 className="text-sm font-semibold text-cream">FL Studio executable</h2>
          <p className="mt-1 text-xs text-engrave">
            Used to run FL Studio's command-line renderer for batch export.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={settings.flStudioPath ?? ""}
              placeholder="Not set"
              className="flex-1 truncate rounded-md border border-rule bg-raised px-3 py-2 text-sm text-body placeholder:text-engrave"
            />
            <button
              onClick={handleDetect}
              disabled={detecting}
              className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 text-sm text-body hover:bg-raised"
            >
              <Wand2 size={14} />
              {detecting ? "Detecting..." : "Auto-detect"}
            </button>
            <button
              onClick={handleBrowseExecutable}
              className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 text-sm text-body hover:bg-raised"
            >
              <FileSearch size={14} />
              Browse
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-cream">Export</h2>
          <p className="mt-1 text-xs text-engrave">
            Where rendered mixdowns go, and in what format.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={settings.outputFolder ?? ""}
              placeholder="Not set"
              className="flex-1 truncate rounded-md border border-rule bg-raised px-3 py-2 text-sm text-body placeholder:text-engrave"
            />
            <button
              onClick={handleBrowseOutput}
              className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 text-sm text-body hover:bg-raised"
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
                    : "border-rule text-body hover:bg-raised"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-rule bg-panel p-4">
          <h2 className="text-sm font-semibold text-cream">Test render</h2>
          <p className="mt-1 text-xs text-engrave">
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
            className="mt-3 flex items-center gap-1.5 rounded-md bg-rule px-3 py-2 text-sm text-cream hover:bg-rule-strong disabled:opacity-50"
          >
            <PlayCircle size={15} />
            {testState.status === "running" ? "Rendering..." : "Render most recent project"}
          </button>
          {demoMode && (
            <div className="mt-2 text-xs text-engrave">
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

/** ffmpeg for the Launch Kit's 9:16 shorts: found automatically, or set here. */
function ShortsSettings() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [status, setStatus] = useState<api.ShortsStatus | null>(null);

  useEffect(() => {
    let live = true;
    api.shortsStatus(settings.ffmpegPath).then((s) => live && setStatus(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, [settings.ffmpegPath]);

  async function browse() {
    const path = await api.pickExecutable();
    if (path) await updateSettings({ ffmpegPath: path });
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-cream">Shorts (ffmpeg)</h2>
      <p className="mt-1 text-xs text-engrave">
        The Launch Kit renders 9:16 shorts with ffmpeg, free and on this computer. Install it once:{" "}
        <code className="rounded bg-rule px-1">brew install ffmpeg</code> (Mac) or{" "}
        <code className="rounded bg-rule px-1">winget install Gyan.FFmpeg</code> (Windows).
      </p>
      <div className={`mt-3 text-xs ${status?.encoder ? "text-emerald-300" : "text-engrave"}`}>
        {!status
          ? "Looking for ffmpeg…"
          : status.encoder
            ? `Found: ${status.path} (${status.encoder})`
            : status.error ?? "Not found. Install it, then restart the app, or pick it below."}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          defaultValue={settings.ffmpegPath ?? ""}
          key={settings.ffmpegPath ?? ""}
          onBlur={(e) => updateSettings({ ffmpegPath: e.target.value.trim() || null })}
          placeholder="Found automatically"
          className={field}
        />
        <button onClick={browse} className="shrink-0 rounded-md border border-rule-strong px-3 py-2 text-sm text-body hover:bg-raised">
          Browse
        </button>
        {settings.ffmpegPath && (
          <button onClick={() => updateSettings({ ffmpegPath: null })} className="shrink-0 rounded-md border border-rule-strong px-3 py-2 text-sm text-body hover:bg-raised">
            Auto
          </button>
        )}
      </div>
    </section>
  );
}

const AI_LANGUAGES = ["English", "French", "Spanish", "German", "Portuguese", "Italian"];
const field =
  "w-full rounded-md border border-rule bg-raised px-3 py-2 text-sm text-cream placeholder:text-engrave focus:border-orange-400/50 focus:outline-none";

/** Gemini key (write-only from here), model and copy language. */
function AiSettings() {
  const aiStatus = useAppStore((s) => s.aiStatus);
  const refreshAiStatus = useAppStore((s) => s.refreshAiStatus);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function saveKey(value: string | null) {
    setMessage(null);
    try {
      await api.setAiKey(value);
      await refreshAiStatus();
      setKey("");
      setMessage({ kind: "ok", text: value ? "Key saved on this computer." : "Key removed." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  const status = !aiStatus?.configured
    ? "Off: no key yet"
    : aiStatus.source === "env"
      ? "On: using GEMINI_API_KEY from the environment"
      : "On: key saved on this computer";

  return (
    <section>
      <h2 className="text-sm font-semibold text-cream">AI (Launch Kit drafts and checks)</h2>
      <p className="mt-1 text-xs text-engrave">
        Uses Google Gemini on its free tier. Get a free key at{" "}
        <button onClick={() => api.openExternal("https://aistudio.google.com/apikey")} className="text-orange-300 underline">
          aistudio.google.com/apikey
        </button>
        . Everything works without it; the AI only adds drafts and a second opinion.
      </p>
      <div className={`mt-3 text-xs ${aiStatus?.configured ? "text-emerald-300" : "text-engrave"}`}>{status}</div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={aiStatus?.configured ? "Paste a new key to replace it" : "Paste your Gemini API key"}
          autoComplete="off"
          spellCheck={false}
          className={field}
        />
        <button onClick={() => saveKey(key)} disabled={!key.trim()} className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-chassis hover:bg-orange-400 disabled:opacity-40">
          Save
        </button>
        {aiStatus?.source === "settings" && (
          <button onClick={() => saveKey(null)} className="rounded-md border border-rule-strong px-3 py-2 text-sm text-body hover:bg-raised">
            Remove
          </button>
        )}
      </div>
      {message && <div className={`mt-2 text-xs ${message.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>{message.text}</div>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs text-engrave">
          Model
          <input
            defaultValue={settings.aiModel ?? ""}
            onBlur={(e) => updateSettings({ aiModel: e.target.value.trim() || null })}
            placeholder={aiStatus?.defaultModel ?? "gemini-3.8-flash"}
            className={`${field} mt-1`}
          />
        </label>
        <label className="text-xs text-engrave">
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
      <p className="mt-2 text-[11px] leading-relaxed text-engrave">
        The key stays on this computer (its own file in the app config folder, not settings.json) and is never shown again. AI calls
        send the song name, tags, notes, mixer track names, credits and kit fields, never audio or file paths. On the free tier Google
        may use them to improve its products.
      </p>
    </section>
  );
}

/** Where the Workers AI page offers "Use REST API": account ID + token template. */
const CF_WORKERS_AI_URL = "https://dash.cloudflare.com/?to=/:account/ai/workers-ai";

/** Cloudflare account ID + API token for FLUX cover concepts (write-only). */
function CoverSettings() {
  const coverStatus = useAppStore((s) => s.coverStatus);
  const refreshCoverStatus = useAppStore((s) => s.refreshCoverStatus);
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(remove: boolean) {
    setMessage(null);
    try {
      await api.setCoverCredentials(remove ? null : accountId, remove ? null : token);
      await refreshCoverStatus();
      setAccountId("");
      setToken("");
      setMessage({ kind: "ok", text: remove ? "Cloudflare credentials removed." : "Saved on this computer." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  const status = !coverStatus?.configured
    ? "Off: no Cloudflare credentials yet"
    : coverStatus.source === "env"
      ? "On: using CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from the environment"
      : "On: credentials saved on this computer";

  return (
    <section>
      <h2 className="text-sm font-semibold text-cream">Cover art (Cloudflare Workers AI, free)</h2>
      <p className="mt-1 text-xs leading-relaxed text-engrave">
        Paints cover concepts from the Launch Kit brief with FLUX.1 [schnell]. Cloudflare's free allowance (10,000 neurons a day) is about
        170 images a day, no card needed. On the{" "}
        <button onClick={() => api.openExternal(CF_WORKERS_AI_URL)} className="text-orange-300 underline">
          Workers AI page of the Cloudflare dashboard
        </button>
        , pick <span className="text-body">Use REST API</span>, copy the <span className="text-body">Account ID</span>, then{" "}
        <span className="text-body">Create a Workers AI API Token</span> (a custom token needs Workers AI Read and Edit).
      </p>
      <div className={`mt-3 text-xs ${coverStatus?.configured ? "text-emerald-300" : "text-engrave"}`}>{status}</div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
        <input
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="Account ID (32 characters)"
          aria-label="Cloudflare account ID"
          autoComplete="off"
          spellCheck={false}
          className={field}
        />
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={coverStatus?.configured ? "Paste a new token to replace it" : "API token"}
          aria-label="Cloudflare API token"
          autoComplete="off"
          spellCheck={false}
          className={field}
        />
        <div className="flex gap-2">
          <button
            onClick={() => save(false)}
            disabled={!accountId.trim() || !token.trim()}
            className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-chassis hover:bg-orange-400 disabled:opacity-40"
          >
            Save
          </button>
          {coverStatus?.source === "settings" && (
            <button onClick={() => save(true)} className="rounded-md border border-rule-strong px-3 py-2 text-sm text-body hover:bg-raised">
              Remove
            </button>
          )}
        </div>
      </div>
      {message && <div className={`mt-2 text-xs ${message.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>{message.text}</div>}
      <p className="mt-2 text-[11px] leading-relaxed text-engrave">
        Both stay on this computer (their own owner-only file in the app config folder, not settings.json) and are never shown again.
        Only the image prompt is sent to Cloudflare: it's built from the cover brief, without the song title, names or notes. No audio,
        no file paths.
      </p>
    </section>
  );
}
