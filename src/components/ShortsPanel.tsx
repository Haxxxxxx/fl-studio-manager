import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clapperboard, FolderOpen } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { drawShortLayout } from "../lib/shorts";
import type { KitField } from "../lib/launchKit";
import type { ProjectInfo, Snippet } from "../types";
import { btn, btnPrimary } from "./ui";

/** 9:16 shorts from the snippets, rendered locally with ffmpeg (free). */
export function ShortsPanel({ project, fields, snippets }: { project: ProjectInfo; fields: KitField[]; snippets: Snippet[] }) {
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const setView = useAppStore((s) => s.setView);
  const [status, setStatus] = useState<api.ShortsStatus | null>(null);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "running" } | { kind: "done"; results: api.ShortResult[] } | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    let live = true;
    api
      .shortsStatus(settings.ffmpegPath)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ path: null, encoder: null, error: null }));
    return () => {
      live = false;
    };
  }, [settings.ffmpegPath]);

  const value = (id: KitField["id"]) => fields.find((f) => f.id === id)?.value ?? "";
  const layoutInput = {
    title: value("title") || project.name,
    artists: value("artists"),
    producers: value("producers"),
    key: value("key"),
    releaseDate: value("releaseDate"),
  };
  const layoutKey = JSON.stringify(layoutInput);
  const preview = useMemo(() => drawShortLayout(layoutInput), [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocker = demoMode
    ? "No audio in sample data. Link a real folder to render."
    : !project.renders[0]
      ? "Render a mixdown first: shorts use its snippets."
      : !snippets.length
        ? "No snippets yet."
        : !settings.outputFolder
          ? "Set an export folder in Settings first."
          : status && !status.encoder
            ? "ffmpeg is needed (free). See below."
            : null;

  async function render() {
    if (!settings.outputFolder || !project.renders[0]) return;
    setState({ kind: "running" });
    try {
      const results = await api.renderShorts({
        ffmpegPath: settings.ffmpegPath,
        master: project.renders[0].path,
        clips: snippets.map((s) => ({ label: s.label, startSec: s.startSec, lengthSec: s.lengthSec, layoutPng: preview })),
        outputFolder: settings.outputFolder,
        folderName: layoutInput.title,
      });
      setState({ kind: "done", results });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
        <Clapperboard size={13} /> Shorts for Reels, TikTok and YouTube Shorts
      </div>
      <div className="flex gap-4">
        <div className="shrink-0">
          <img src={preview} alt="9:16 layout preview" className="h-[284px] w-[160px] rounded-md border border-white/10 object-cover" />
          <div className="mt-1 text-center text-[10px] text-white/35">The waveform animates in the dark band</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-xs text-white/60">
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
              <div className="mt-1 text-white/55">
                Install it once (free): <code className="rounded bg-black/30 px-1">brew install ffmpeg</code> on Mac,{" "}
                <code className="rounded bg-black/30 px-1">winget install Gyan.FFmpeg</code> on Windows. Then restart the app, or{" "}
                <button onClick={() => setView("settings")} className="underline">
                  set its path in Settings
                </button>
                .
              </div>
            </div>
          ) : (
            <div className="text-white/40">Looking for ffmpeg…</div>
          )}
          <div>
            <button onClick={render} disabled={!!blocker || state.kind === "running"} title={blocker ?? undefined} className={btnPrimary}>
              <Clapperboard size={14} /> {state.kind === "running" ? `Rendering ${snippets.length} shorts…` : `Render ${snippets.length} short${snippets.length === 1 ? "" : "s"}`}
            </button>
            {blocker && <div className="mt-1.5 text-[11px] text-white/40">{blocker}</div>}
          </div>
          {state.kind === "error" && <div className="text-red-300">{state.message}</div>}
        </div>
      </div>
      {state.kind === "done" && (
        <div className="mt-4 flex flex-wrap gap-3 border-t border-white/5 pt-3">
          {state.results.map((r) =>
            r.path ? (
              <div key={r.label} className="flex flex-col items-center gap-1">
                <video src={api.audioSrc(r.path)} controls preload="metadata" className="h-[256px] w-[144px] rounded-md bg-black" />
                <span className="text-[11px] text-white/60">{r.label}</span>
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
