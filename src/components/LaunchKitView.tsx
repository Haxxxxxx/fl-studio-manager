import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, FolderOpen, Minus, Pause, Play, Plus, Rocket, RotateCcw, Sparkles } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useCrewStore } from "../store/useCrewStore";
import * as api from "../lib/tauri";
import {
  aiSummary,
  buildKit,
  demoAnalysis,
  formatDuration,
  kitChecks,
  kitFiles,
  kitSnippets,
  DISTRIBUTION_FIELDS,
  artistLine,
  masterBaseName,
  METADATA_FIELDS,
  type Check as KitCheck,
  type KitField,
  type KitInput,
} from "../lib/launchKit";
import { draftCopy, reviewKit } from "../lib/ai";
import { formatRelative } from "../lib/format";
import { stageRank } from "../lib/songs";
import type { AudioAnalysis, ProjectInfo, Snippet } from "../types";
import { useVisibleSongs } from "./LibraryView";
import { SongPicker } from "./SongPicker";
import { ShortsPanel } from "./ShortsPanel";
import { CoverConcepts } from "./CoverConcepts";
import { btn, btnPrimary } from "./ui";
import { Card, CheckLine, FieldRow, KitStatus } from "../ui";

// Snippet colors: the dark categorical slots, in fixed order (as elsewhere).
const SNIPPET_COLORS = ["#3987e5", "#d95926", "#199e70"];


/** Keyed by mixdown path + mtime + tempo: re-analyze when the mixdown
 * changes, or the tempo does (snippets snap to its bar grid). */
const analysisCache = new Map<string, AudioAnalysis>();

function useAnalysis(project: ProjectInfo | undefined, demoMode: boolean) {
  const render = project?.renders[0];
  const key = render ? `${render.path}|${render.modifiedAtMs}|${project?.tempoBpm ?? ""}` : null;
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
  const setKitEdits = useAppStore((s) => s.setKitEdits);
  const crewName = useCrewStore((s) => s.crews.find((c) => c.id === s.activeCrewId)?.name ?? null);
  const crewSongs = useCrewStore((s) => s.songs);
  const setSnippetStart = useAppStore((s) => s.setSnippetStart);
  const acceptKit = useAppStore((s) => s.acceptKit);

  // Songs closest to release first: ones with a mixdown, then by stage
  // (Promotion … Creation), then by last save.
  const ordered = useMemo(() => {
    const stage = (p: ProjectInfo) => stageRank(workspace.songs[p.path]?.status);
    const rank = (p: ProjectInfo) => (p.renders.length ? 0 : 10) + stage(p);
    return [...songs].sort((a, b) => rank(a) - rank(b) || b.modifiedAtMs - a.modifiedAtMs);
  }, [songs, workspace.songs]);
  const project = songs.find((p) => p.path === launchPath) ?? ordered[0];
  const { analysis, error: analysisError, loading } = useAnalysis(project, demoMode);
  const [exportState, setExportState] = useState<{ status: "idle" | "running" } | { status: "done"; dir: string } | { status: "error"; message: string }>({ status: "idle" });

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-white/58">
        Link a project folder (or load sample data) to build a launch kit.
      </div>
    );
  }

  const meta = workspace.songs[project.path] ?? {};
  // Fridays already taken: other releases, other kits, the crew's songs.
  const busyDates = [
    ...workspace.albums.filter((a) => !a.trackPaths.includes(project.path)).map((a) => a.releaseDate),
    ...Object.entries(workspace.songs)
      .filter(([p]) => p !== project.path)
      .map(([, m]) => m.launchKit?.edits?.releaseDate),
    ...crewSongs.filter((s) => s.id !== meta.shareId).map((s) => s.release_date),
  ].filter((d): d is string => !!d);
  const kitInput: KitInput = {
    project,
    meta,
    people: workspace.people,
    albums: workspace.albums,
    analysis,
    language: settings.aiLanguage ?? "English",
    labelName: crewName,
    busyDates,
  };
  const fields = buildKit(kitInput);
  const snippets = kitSnippets(analysis, meta);
  const extra = kitChecks(project, analysis);
  const all: KitCheck[] = [...extra, ...fields.flatMap((f) => (f.check ? [f.check] : []))];
  const missing = all.filter((c) => c.level === "missing").length;
  const ai = aiSummary(fields);
  const warnings = all.length - missing + ai.flagged;
  const accepted = meta.launchKit?.acceptedAtMs;
  const byId = (id: KitField["id"]) => fields.find((f) => f.id === id)!;

  const edits = meta.launchKit?.edits ?? {};
  const suggestions = fields.filter((f) => f.review && !f.review.stale && f.review.suggestion && f.review.suggestion !== f.value);

  async function handleExport() {
    if (!project) return;
    if (!settings.outputFolder) return setExportState({ status: "error", message: "Set an export folder in Settings first." });
    if (missing + ai.flagged > 0) {
      const what = [missing && `${missing} field${missing === 1 ? "" : "s"} still need${missing === 1 ? "s" : ""} you`, ai.flagged && `the AI flagged ${ai.flagged}`]
        .filter(Boolean)
        .join(" and ");
      if (!window.confirm(`${what[0].toUpperCase()}${what.slice(1)}. Export anyway? Open items go in checklist.md and the distributor sheet.`)) return;
    }
    const title = byId("title").value || project.name;
    setExportState({ status: "running" });
    try {
      const dir = await api.exportLaunchKit({
        outputFolder: settings.outputFolder,
        folderName: title,
        files: kitFiles(fields, snippets, extra),
        master: project.renders[0]?.path ?? null,
        masterName: masterBaseName(fields, project.name),
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
            <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-white">Launch Kit</h1>
          </div>
          <SongPicker
            songs={songs}
            current={project}
            workspace={workspace}
            onSelect={(path) => {
              openLaunchKit(path);
              setExportState({ status: "idle" });
            }}
          />
          <KitStatus missing={missing} warnings={warnings} accepted={!!accepted} aiVerified={ai.verified} />
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
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/62">
          {suggestions.length > 0 && (
            <button
              onClick={() => setKitEdits(project.path, Object.fromEntries(suggestions.map((f) => [f.id, f.review!.suggestion!])))}
              className="rounded bg-violet-500/15 px-2 py-1 text-violet-200 hover:bg-violet-500/25"
            >
              Use all {suggestions.length} AI suggestion{suggestions.length === 1 ? "" : "s"}
            </button>
          )}
          {Object.keys(edits).length > 0 && (
            <button
              onClick={() => window.confirm("Undo every change you made in this kit?") && setKitEdits(project.path, null)}
              className="hover:text-white"
            >
              Reset all edits
            </button>
          )}
          <button
            onClick={() =>
              window.confirm("Clear every pre-filled value so you can fill the kit in by hand? (Reset all edits brings them back.)") &&
              setKitEdits(project.path, Object.fromEntries(fields.filter((f) => f.kind !== "multiline").map((f) => [f.id, ""])))
            }
            className="hover:text-white"
          >
            Start blank
          </button>
        </div>

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
            <Card title="Distribution: what the upload form asks">
              <div className="flex flex-col divide-y divide-white/5">
                {DISTRIBUTION_FIELDS.map((id) => (
                  <FieldRow key={id} field={byId(id)} onChange={(v) => setKitEdit(project.path, id, v)} />
                ))}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <AiPanel key={`ai:${project.path}`} path={project.path} input={kitInput} fields={fields} />
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
            <ShortsPanel
              key={`shorts:${project.path}`}
              project={project}
              fields={fields}
              snippets={snippets}
              analysisLoading={loading}
              analysisError={analysisError}
            />
            <Card title="Cover art brief">
              <FieldRow field={byId("coverBrief")} onChange={(v) => setKitEdit(project.path, "coverBrief", v)} bare />
              <CoverConcepts key={project.path} path={project.path} title={byId("title").value || project.name} artists={artistLine(byId("artists").value, byId("featuring").value)} brief={byId("coverBrief").value} />
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


/** Draft copy with Gemini, then check every field. Off without a key. */
function AiPanel({ path, input, fields }: { path: string; input: KitInput; fields: KitField[] }) {
  const aiStatus = useAppStore((s) => s.aiStatus);
  const settings = useAppStore((s) => s.settings);
  const setKitAi = useAppStore((s) => s.setKitAi);
  const setKitEdit = useAppStore((s) => s.setKitEdit);
  const setView = useAppStore((s) => s.setView);
  const [running, setRunning] = useState<"draft" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!aiStatus?.configured) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-4 text-sm">
        <Sparkles size={16} className="shrink-0 text-violet-300" />
        <span className="flex-1 text-white/60">AI drafts and checks are off. They need a free Gemini API key.</span>
        <button onClick={() => setView("settings")} className={btn}>
          Add a key
        </button>
      </div>
    );
  }

  const model = settings.aiModel || aiStatus.defaultModel;
  const summary = aiSummary(fields);
  const drafts = input.meta.launchKit?.ai?.drafts;
  const reviewedAt = input.meta.launchKit?.ai?.review?.atMs;
  const answeredBy = [drafts?.model, input.meta.launchKit?.ai?.review?.model];
  const backupUsed = answeredBy.find((m) => m && m !== model);

  async function run(withDraft: boolean) {
    setError(null);
    // A call can take a while: if the user switches between sample data and
    // their real songs meanwhile, the result belongs to neither.
    const startedInDemo = useAppStore.getState().demoMode;
    const stillValid = () => useAppStore.getState().demoMode === startedInDemo;
    try {
      let current = fields;
      if (withDraft) {
        setRunning("draft");
        const d = await draftCopy(input, fields, settings);
        if (!stillValid()) return;
        // d.model is the model that answered (the backup one if Gemini was busy).
        const newDrafts = { ...d, atMs: Date.now() };
        // Asking for new copy replaces hand edits of those two fields.
        setKitEdit(path, "captions", undefined);
        setKitEdit(path, "coverBrief", undefined);
        setKitAi(path, { drafts: newDrafts });
        const kit = input.meta.launchKit ?? {};
        const { captions: _c, coverBrief: _b, ...edits } = kit.edits ?? {};
        current = buildKit({ ...input, meta: { ...input.meta, launchKit: { ...kit, edits, ai: { ...kit.ai, drafts: newDrafts } } } });
      }
      setRunning("review");
      const checked = await reviewKit(input, current, settings);
      if (!stillValid()) return;
      setKitAi(path, { review: { fields: checked.review, model: checked.model, atMs: Date.now() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  }

  const line =
    summary.state === "unchecked"
      ? "Not checked yet."
      : summary.state === "stale"
        ? "Some values changed since the last check."
        : summary.verified
          ? "Every field looks right."
          : [
              summary.flagged && `${summary.flagged} field${summary.flagged === 1 ? "" : "s"} to look at.`,
              summary.skipped && `${summary.skipped} field${summary.skipped === 1 ? "" : "s"} not checked. Re-check.`,
            ]
              .filter(Boolean)
              .join(" ") || "No problems found.";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-violet-300" />
        <span className="text-[12px] font-semibold text-violet-200/70">AI layer · {model}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => run(true)} disabled={!!running} className={btnPrimary}>
          <Sparkles size={14} /> {running === "draft" ? "Writing…" : "Write captions & brief"}
        </button>
        <button onClick={() => run(false)} disabled={!!running} className={btn}>
          <Check size={14} /> {running === "review" ? "Checking every field…" : summary.state === "unchecked" ? "Check kit" : "Re-check"}
        </button>
        {drafts && !running && (
          <button onClick={() => setKitAi(path, { drafts: undefined })} className="text-xs text-white/58 hover:text-white" title="Back to the template text">
            Discard AI drafts
          </button>
        )}
      </div>
      <div className={`text-xs ${summary.verified ? "text-emerald-300" : summary.state === "checked" ? "text-amber-300" : "text-white/50"}`}>
        {line}
        {reviewedAt && <span className="text-white/55"> · checked {formatRelative(reviewedAt)}</span>}
      </div>
      {running && (
        <div className="text-[11px] text-white/58">If Gemini is busy this retries on its own; it gives up after 2 minutes.</div>
      )}
      {backupUsed && !running && (
        <div className="text-[11px] text-white/58">{model} was overloaded, so {backupUsed} (the backup free model) answered.</div>
      )}
      {error && <div className="text-xs text-red-300">{error}</div>}
      <div className="text-[11px] leading-relaxed text-white/50">
        Sends the song name, tags, notes, mixer track names, credits and these fields to Google Gemini. No audio, no file paths. On the free tier Google may use them to improve its products.
      </div>
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

  if (!render) return <div className="py-6 text-center text-xs text-white/58">Render a mixdown to get snippets.</div>;
  if (loading) return <div className="py-6 text-center text-xs text-white/58">Listening to the mixdown…</div>;
  if (error || !analysis) return <div className="py-6 text-center text-xs text-red-300">{error ?? "No analysis"}</div>;
  if (!snippets.length) return <div className="py-6 text-center text-xs text-white/58">The mixdown is shorter than 15 seconds.</div>;

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
      <div className="flex justify-between text-[10px] text-white/50">
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
              <span className="flex-1 text-[11px] text-white/50">{moved ? "moved by you" : i === 0 ? "loudest stretch" : ""}</span>
              <button onClick={() => nudge(-bar)} title={project.tempoBpm ? "1 bar earlier" : "1 s earlier"} className="rounded p-1 text-white/58 hover:bg-white/10 hover:text-white">
                <Minus size={12} />
              </button>
              <button onClick={() => nudge(bar)} title={project.tempoBpm ? "1 bar later" : "1 s later"} className="rounded p-1 text-white/58 hover:bg-white/10 hover:text-white">
                <Plus size={12} />
              </button>
              {moved && (
                <button onClick={() => onMove(s.label, undefined)} title="Back to the detected spot" className="rounded p-1 text-white/58 hover:bg-white/10 hover:text-white">
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
      <div className="text-[11px] text-white/55">Clips are cut on export, with short fades, into snippets/ in the kit.</div>
    </div>
  );
}
