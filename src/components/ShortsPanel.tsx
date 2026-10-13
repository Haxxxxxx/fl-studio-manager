import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clapperboard, FolderOpen } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { drawShortLayout } from "../lib/shorts";
import { artistLine, type KitField } from "../lib/launchKit";
import type { ProjectInfo, Snippet } from "../types";
import { btn, btnPrimary } from "./ui";

/** 9:16 shorts from the snippets, rendered locally with ffmpeg (free). */
export function ShortsPanel({
  project,
  fields,
  snippets,
  analysisLoading,
  analysisError,
}: {
  project: ProjectInfo;
  fields: KitField[];
  snippets: Snippet[];
  analysisLoading: boolean;
  analysisError: string | null;
}) {
  const settings = useAppStore((s) => s.settings);
  const pickOutputFolder = useAppStore((s) => s.pickOutputFolder);
  const [checkCount, setCheckCount] = useState(0);
  const recheck = () => setCheckCount((n) => n + 1);
  const demoMode = useAppStore((s) => s.demoMode);
  const setView = useAppStore((s) => s.setView);
  const [status, setStatus] = useState<api.ShortsStatus | null>(null);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "running" } | { kind: "done"; results: api.ShortResult[] } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    let live = true;
    api
      .shortsStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ path: null, encoder: null, error: null }));
    return () => {
      live = false;
    };
  }, [settings.ffmpegPath, checkCount]);

  const value = (id: KitField["id"]) => fields.find((f) => f.id === id)?.value ?? "";
  const layoutInput = {
    title: value("title") || project.name,
    artists: artistLine(value("artists"), value("featuring")),
    producers: value("producers"),
    key: value("key"),
    releaseDate: value("releaseDate"),
  };
  const layoutKey = JSON.stringify(layoutInput);
  const preview = useMemo(() => drawShortLayout(layoutInput), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseExportFolder() {
    await pickOutputFolder();
  }

  // What stops a render, in the order the user should fix it, each with a
  // one-click fix where there is one.
  const blocker: { message: string; action?: { label: string; run: () => void } } | null = demoMode
    ? { message: "Sample data has no audio. Link your real project folder to render shorts." }
    : !project.renders[0]
      ? { message: "This song has no mixdown yet. Export a WAV or MP3 from your DAW next to the project (or into your export folder), then come back." }
      : analysisLoading
        ? { message: "Listening to the mixdown to find the snippets…" }
        : analysisError
          ? { message: `Couldn't read the mixdown: ${analysisError}` }
          : !snippets.length
            ? { message: "The mixdown is shorter than 15 seconds, so there's nothing to cut." }
            : !settings.outputFolder
              ? { message: "Choose where shorts get saved (your export folder).", action: { label: "Choose export folder", run: chooseExportFolder } }
              : status && !status.encoder
                ? { message: "ffmpeg is needed (free, one install). See the steps below.", action: { label: "Check again", run: recheck } }
                : null;

  async function render() {
    if (!settings.outputFolder || !project.renders[0]) return;
    setState({ kind: "running" });
    try {
      const results = await api.renderShorts({
        master: project.renders[0].path,
        clips: snippets.map((s) => ({ label: s.label, startSec: s.startSec, lengthSec: s.lengthSec, layoutPng: preview })),
        folderName: layoutInput.title,
      });
      setState({ kind: "done", results });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="rounded-lg border border-rule bg-panel p-4">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">
        <Clapperboard size={13} /> Shorts for Reels, TikTok and YouTube Shorts
      </div>
      <div className="flex gap-4">
        <div className="shrink-0">
          <img src={preview} alt="9:16 layout preview" className="h-[284px] w-[160px] rounded-md border border-rule object-cover" />
          <div className="mt-1 text-center text-[10px] text-engrave">The waveform animates in the dark band</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs text-body">
          <p>
            One 1080×1920 MP4 per snippet ({snippets.map((s) => s.label).join(", ") || "none yet"}) with your real audio, made on this computer.
            Free, no upload.
          </p>
          {status?.encoder ? (
            <div className="text-emerald-300/80">ffmpeg ready ({status.encoder})</div>
          ) : status ? (
            <div className="rounded-md border border-amber-400/20 bg-amber-500/[0.06] p-2.5 text-amber-100/80">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={12} /> {status.error ?? "ffmpeg not found"}
              </div>
              <div className="mt-1 text-engrave">
                Install it once (free): <code className="rounded bg-black/30 px-1">brew install ffmpeg</code> on Mac,{" "}
                <code className="rounded bg-black/30 px-1">winget install Gyan.FFmpeg</code> on Windows. Then restart the app, or{" "}
                <button onClick={() => setView("settings")} className="underline">
                  set its path in Settings
                </button>
                .
              </div>
            </div>
          ) : (
            <div className="text-engrave">Looking for ffmpeg…</div>
          )}
          <div>
            <button onClick={render} disabled={!!blocker || state.kind === "running"} title={blocker?.message} className={btnPrimary}>
              <Clapperboard size={14} /> {state.kind === "running" ? `Rendering ${snippets.length} shorts…` : `Render ${snippets.length} short${snippets.length === 1 ? "" : "s"}`}
            </button>
            {blocker && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-400/25 bg-amber-500/[0.07] px-2.5 py-2 text-[12px] text-amber-100/90">
                <AlertTriangle size={13} className="shrink-0 text-amber-300" />
                <span className="flex-1">{blocker.message}</span>
                {blocker.action && (
                  <button onClick={blocker.action.run} className="shrink-0 rounded bg-amber-400/20 px-2 py-1 font-medium text-amber-50 hover:bg-amber-400/30">
                    {blocker.action.label}
                  </button>
                )}
              </div>
            )}
          </div>
          {state.kind === "error" && <div className="text-red-300">{state.message}</div>}
        </div>
      </div>
      {state.kind === "done" && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-3">
          {state.results.map((r) =>
            r.path ? (
              <div key={r.label} className="flex flex-col items-center gap-1">
                <video src={api.audioSrc(r.path)} controls preload="metadata" className="h-[256px] w-[144px] rounded-md bg-black" />
                <span className="text-[11px] text-body">{r.label}</span>
              </div>
            ) : (
              <div key={r.label} className="max-w-[200px] text-[11px] text-red-300">
                {r.label}: {r.error}
              </div>
            ),
          )}
          {state.results.some((r) => r.path) && (
            <button onClick={() => api.revealInFileManager(state.results.find((r) => r.path)!.path!)} className={`${btn} self-end`}>
              <FolderOpen size={14} /> Show in folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}
