import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ClipboardCopy, FolderOpen, Minus, Pause, Play, Plus, Rocket, RotateCcw } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { buildKit, demoAnalysis, formatDuration, kitChecks, kitFiles, kitSnippets, METADATA_FIELDS, type Check as KitCheck, type KitField } from "../lib/launchKit";
import { songLabel, statusInfo } from "../lib/songs";
import type { AudioAnalysis, ProjectInfo, Snippet } from "../types";
import { useVisibleSongs } from "./LibraryView";
import { btn, btnPrimary, input } from "./ui";

// Snippet colors: the dark categorical slots, in fixed order (as elsewhere).
const SNIPPET_COLORS = ["#3987e5", "#d95926", "#199e70"];

const SOURCE_STYLE: Record<KitField["source"], { label: string; className: string }> = {
  detected: { label: "Detected", className: "bg-emerald-500/15 text-emerald-300" },
  suggested: { label: "Suggested", className: "bg-sky-500/15 text-sky-300" },
  edited: { label: "Edited", className: "bg-orange-500/15 text-orange-300" },
  missing: { label: "Needs you", className: "bg-red-500/15 text-red-300" },
};

/** Keyed by mixdown path + mtime: re-analyze only when the mixdown changes. */
const analysisCache = new Map<string, AudioAnalysis>();

function useAnalysis(project: ProjectInfo | undefined, demoMode: boolean) {
  const render = project?.renders[0];
  const key = render ? `${render.path}|${render.modifiedAtMs}` : null;
  const [state, setState] = useState<{ key: string | null; analysis: AudioAnalysis | null; error: string | null; loading: boolean }>({
    key: null,
    analysis: null,
    error: null,
    loading: false,
  });

  useEffect(() => {
    if (!project || !render || !key) return setState({ key, analysis: null, error: null, loading: false });
    if (demoMode) return setState({ key, analysis: demoAnalysis(project), error: null, loading: false });
    const cached = analysisCache.get(key);
    if (cached) return setState({ key, analysis: cached, error: null, loading: false });
    let live = true;
    setState({ key, analysis: null, error: null, loading: true });
    api
      .analyzeAudio(render.path, project.tempoBpm)
      .then((a) => {
        analysisCache.set(key, a);
        if (live) setState({ key, analysis: a, error: null, loading: false });
      })
      .catch((e) => live && setState({ key, analysis: null, error: String(e), loading: false }));
    return () => {
      live = false;
    };
  }, [key, demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return state.key === key ? state : { analysis: null, error: null, loading: !!key };
}

export function LaunchKitView() {
  const songs = useVisibleSongs();
  const launchPath = useAppStore((s) => s.launchPath);
  const openLaunchKit = useAppStore((s) => s.openLaunchKit);
  const workspace = useAppStore((s) => s.workspace);
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const setKitEdit = useAppStore((s) => s.setKitEdit);
  const setSnippetStart = useAppStore((s) => s.setSnippetStart);
  const acceptKit = useAppStore((s) => s.acceptKit);

  // Songs closest to release first: ones with a mixdown, then Done,
  // Mastering, Mixing, then the rest by last save.
  const ordered = useMemo(() => {
    const stage = (p: ProjectInfo) => ({ done: 0, mastering: 1, mixing: 2 })[workspace.songs[p.path]?.status as string] ?? 3;
    const rank = (p: ProjectInfo) => (p.renders.length ? 0 : 4) + stage(p);
    return [...songs].sort((a, b) => rank(a) - rank(b) || b.modifiedAtMs - a.modifiedAtMs);
  }, [songs, workspace.songs]);
  const project = songs.find((p) => p.path === launchPath) ?? ordered[0];
  const { analysis, error: analysisError, loading } = useAnalysis(project, demoMode);
  const [exportState, setExportState] = useState<{ status: "idle" | "running" } | { status: "done"; dir: string } | { status: "error"; message: string }>({ status: "idle" });

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-white/40">
        Link a project folder (or load sample data) to build a launch kit.
      </div>
    );
  }

  const meta = workspace.songs[project.path] ?? {};
  const fields = buildKit({ project, meta, people: workspace.people, albums: workspace.albums, analysis });
  const snippets = kitSnippets(analysis, meta);
  const extra = kitChecks(project);
  const all: KitCheck[] = [...extra, ...fields.flatMap((f) => (f.check ? [f.check] : []))];
  const missing = all.filter((c) => c.level === "missing").length;
  const warnings = all.length - missing;
  const accepted = meta.launchKit?.acceptedAtMs;
  const byId = (id: KitField["id"]) => fields.find((f) => f.id === id)!;

  async function handleExport() {
    if (!project) return;
    if (!settings.outputFolder) return setExportState({ status: "error", message: "Set an export folder in Settings first." });
    const sep = settings.outputFolder.includes("\\") ? "\\" : "/";
    const title = byId("title").value || project.name;
    const artists = byId("artists").value;
    setExportState({ status: "running" });
    try {
      const dir = await api.exportLaunchKit({
        outDir: [settings.outputFolder, "Launch Kits", title.replace(/[/\\:*?"<>|]/g, "_")].join(sep),
        files: kitFiles(fields, snippets, extra),
        master: project.renders[0]?.path ?? null,
        masterName: artists ? `${artists} - ${title}` : title,
        clips: snippets,
      });
      setExportState({ status: "done", dir });
    } catch (e) {
      setExportState({ status: "error", message: String(e) });
    }
  }

  return (
    <div className="min-w-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-orange-300">
            <Rocket size={18} />
            <h1 className="text-lg font-semibold text-white">Launch Kit</h1>
          </div>
          <select
            value={project.path}
            onChange={(e) => {
              openLaunchKit(e.target.value);
              setExportState({ status: "idle" });
            }}
            className={`${input} !w-80`}
          >
            {ordered.map((p) => (
              <option key={p.path} value={p.path}>
                {songLabel(p, songs)} · {statusInfo(workspace.songs[p.path]?.status).label}
              </option>
            ))}
          </select>
          <KitStatus missing={missing} warnings={warnings} accepted={!!accepted} />
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => acceptKit(project.path)}
              disabled={missing > 0 || !!accepted}
              title={missing > 0 ? "Answer the fields marked “Needs you” first" : "Mark every pre-filled value as reviewed"}
              className={btn}
            >
              <Check size={14} /> {accepted ? "Accepted" : "Accept all"}
            </button>
            <button
              onClick={handleExport}
              disabled={demoMode || exportState.status === "running"}
              title={demoMode ? "Export is off for sample data" : `Writes the kit to <export folder>/Launch Kits/`}
              className={btnPrimary}
            >
              <Rocket size={14} /> {exportState.status === "running" ? "Exporting…" : "Export kit"}
            </button>
          </div>
        </header>

        {exportState.status === "done" && (
          <div className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
            <CheckCircle2 size={16} /> Kit exported{missing + warnings ? `, with ${missing + warnings} open item(s) listed in checklist.md` : ""}.
            <button onClick={() => api.revealInFileManager(exportState.dir)} className="ml-auto flex items-center gap-1 text-xs underline">
              <FolderOpen size={13} /> Show folder
            </button>
          </div>
        )}
        {exportState.status === "error" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">{exportState.message}</div>
        )}
        {extra.map((c) => (
          <CheckLine key={c.message} check={c} />
        ))}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-5">
          <div className="flex flex-col gap-5">
            <Card title="Metadata">
              <div className="flex flex-col divide-y divide-white/5">
                {METADATA_FIELDS.map((id) => (
                  <FieldRow key={id} field={byId(id)} onChange={(v) => setKitEdit(project.path, id, v)} />
                ))}
              </div>
            </Card>
            <Card title="Release timing">
              <FieldRow field={byId("releaseDate")} onChange={(v) => setKitEdit(project.path, "releaseDate", v)} />
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Card title="Snippets for reels and stories">
              <Snippets
                project={project}
                analysis={analysis}
                snippets={snippets}
                loading={loading}
                error={analysisError}
                demoMode={demoMode}
                onMove={(label, start) => setSnippetStart(project.path, label, start)}
              />
            </Card>
            <Card title="Cover art brief">
              <FieldRow field={byId("coverBrief")} onChange={(v) => setKitEdit(project.path, "coverBrief", v)} bare />
            </Card>
            <Card title="Captions">
              <FieldRow field={byId("captions")} onChange={(v) => setKitEdit(project.path, "captions", v)} bare />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function KitStatus({ missing, warnings, accepted }: { missing: number; warnings: number; accepted: boolean }) {
  if (missing) {
    return (
      <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-red-200">
        {missing} need{missing === 1 ? "s" : ""} you{warnings ? ` · ${warnings} to check` : ""}
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${accepted ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/70"}`}>
      <CheckCircle2 size={12} /> {accepted ? "Reviewed, ready to export" : "Ready to review"}
      {warnings ? ` · ${warnings} to check` : ""}
    </span>
  );
}

function CheckLine({ check }: { check: KitCheck }) {
  const color = check.level === "missing" ? "text-red-300" : "text-amber-300";
  return (
    <div className={`flex items-start gap-1.5 text-xs ${color}`}>
      <AlertTriangle size={12} className="mt-px shrink-0" />
      <span>{check.message}</span>
    </div>
  );
}

function FieldRow({ field, onChange, bare = false }: { field: KitField; onChange: (v: string | undefined) => void; bare?: boolean }) {
  const source = SOURCE_STYLE[field.source];
  const [copied, setCopied] = useState(false);
  return (
    <div className={`flex flex-col gap-1.5 ${bare ? "" : "py-3 first:pt-0 last:pb-0"}`}>
      <div className="flex items-center gap-2">
        {!bare && <span className="text-xs font-medium text-white/70">{field.label}</span>}
        <span className={`rounded px-1.5 py-px text-[10px] font-medium ${source.className}`}>{source.label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/35" title={field.note}>
          {field.note}
        </span>
        {field.source === "edited" && (
          <button onClick={() => onChange(undefined)} title="Back to the generated value" className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white">
            <RotateCcw size={11} /> Reset
          </button>
        )}
        {field.kind === "multiline" && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(field.value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white"
          >
            <ClipboardCopy size={11} /> {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {field.kind === "choice" ? (
        <div className="flex gap-1.5">
          {field.options!.map((o) => (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`rounded-md border px-3 py-1 text-sm ${field.value === o ? "border-orange-400/60 bg-orange-500/15 text-orange-200" : "border-white/10 text-white/60 hover:bg-white/5"}`}
            >
              {o}
            </button>
          ))}
        </div>
      ) : field.kind === "multiline" ? (
        <textarea value={field.value} onChange={(e) => onChange(e.target.value)} rows={field.id === "captions" ? 10 : 11} className={`${input} resize-y font-mono text-xs leading-relaxed`} />
      ) : (
        <input
          type={field.kind === "date" ? "date" : "text"}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.source === "missing" ? "Type it once" : undefined}
          className={`${input} [color-scheme:dark]`}
        />
      )}
      {field.check && <CheckLine check={field.check} />}
    </div>
  );
}

function Snippets({
  project,
  analysis,
  snippets,
  loading,
  error,
  demoMode,
  onMove,
}: {
  project: ProjectInfo;
  analysis: AudioAnalysis | null;
  snippets: Snippet[];
  loading: boolean;
  error: string | null;
  demoMode: boolean;
  onMove: (label: string, start: number | undefined) => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const render = project.renders[0];

  useEffect(() => () => audio.current?.pause(), [render?.path]);

  if (!render) return <div className="py-6 text-center text-xs text-white/40">Render a mixdown to get snippets.</div>;
  if (loading) return <div className="py-6 text-center text-xs text-white/40">Listening to the mixdown…</div>;
  if (error || !analysis) return <div className="py-6 text-center text-xs text-red-300">{error ?? "No analysis"}</div>;
  if (!snippets.length) return <div className="py-6 text-center text-xs text-white/40">The mixdown is shorter than 15 seconds.</div>;

  const duration = analysis.durationSec;
  const bar = project.tempoBpm ? 240 / project.tempoBpm : 1;
  // ~240 bars across, each the max of its windows so peaks survive.
  const step = Math.max(1, Math.ceil(analysis.energy.length / 240));
  const bars = Array.from({ length: Math.ceil(analysis.energy.length / step) }, (_, i) => Math.max(...analysis.energy.slice(i * step, i * step + step)));

  function play(s: Snippet) {
    const el = audio.current;
    if (!el) return;
    if (playing === s.label) {
      el.pause();
      return setPlaying(null);
    }
    el.currentTime = s.startSec;
    el.ontimeupdate = () => {
      if (el.currentTime >= s.startSec + s.lengthSec) {
        el.pause();
        setPlaying(null);
      }
    };
    el.play().then(() => setPlaying(s.label)).catch(() => setPlaying(null));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-20 w-full">
        <svg viewBox={`0 0 ${bars.length} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Loudness of the mixdown over time">
          {bars.map((e, i) => (
            <rect key={i} x={i + 0.15} y={100 - e * 100} width={0.7} height={e * 100} fill="rgba(255,255,255,0.22)" />
          ))}
        </svg>
        {snippets.map((s, i) => (
          <div
            key={s.label}
            title={s.label}
            className="absolute bottom-0 top-0 rounded-sm border-x-2"
            style={{
              left: `${(s.startSec / duration) * 100}%`,
              width: `${(s.lengthSec / duration) * 100}%`,
              background: `${SNIPPET_COLORS[i % 3]}2e`,
              borderColor: SNIPPET_COLORS[i % 3],
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-white/30">
        <span>0:00</span>
        <span>{formatDuration(duration)}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {snippets.map((s, i) => {
          const moved = s.startSec !== analysis.snippets.find((d) => d.label === s.label)?.startSec;
          const nudge = (d: number) => onMove(s.label, Math.min(Math.max(0, s.startSec + d), Math.max(0, duration - s.lengthSec)));
          return (
            <div key={s.label} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2.5 py-1.5 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SNIPPET_COLORS[i % 3] }} />
              <span className="w-24 text-white/80">{s.label}</span>
              <span className="w-24 tabular-nums text-white/50">
                {formatDuration(s.startSec)}–{formatDuration(s.startSec + s.lengthSec)}
              </span>
              <span className="flex-1 text-[11px] text-white/30">{moved ? "moved by you" : i === 0 ? "loudest stretch" : ""}</span>
              <button onClick={() => nudge(-bar)} title={project.tempoBpm ? "1 bar earlier" : "1 s earlier"} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
                <Minus size={12} />
              </button>
              <button onClick={() => nudge(bar)} title={project.tempoBpm ? "1 bar later" : "1 s later"} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
                <Plus size={12} />
              </button>
              {moved && (
                <button onClick={() => onMove(s.label, undefined)} title="Back to the detected spot" className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
                  <RotateCcw size={12} />
                </button>
              )}
              <button
                onClick={() => play(s)}
                disabled={demoMode}
                title={demoMode ? "No audio in sample data" : "Play this snippet"}
                className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-white/80 hover:bg-white/15 disabled:opacity-40"
              >
                {playing === s.label ? <Pause size={12} /> : <Play size={12} />}
              </button>
            </div>
          );
        })}
      </div>
      {!demoMode && <audio ref={audio} src={api.audioSrc(render.path)} preload="none" />}
      <div className="text-[11px] text-white/35">Clips are cut on export, with short fades, into snippets/ in the kit.</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-white/40">{title}</div>
      {children}
    </div>
  );
}
