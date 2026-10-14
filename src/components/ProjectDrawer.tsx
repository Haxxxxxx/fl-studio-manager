import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Package,
  CheckCircle2,
  Copy,
  Disc3,
  Download,
  FolderInput,
  FolderOpen,
  History,
  PlayCircle,
  Plus,
  Rocket,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatDateTime, trashName } from "../lib/format";
import { audioSrc, backupsOnRiskyVolumes, openInFlStudio, revealInFileManager } from "../lib/tauri";
import { KEYS, albumsOf, backupsBytes, formatBpm, missingPlugins, renderFreshness } from "../lib/songs";
import type { ProjectInfo } from "../types";
import { detectKey } from "../lib/people";
import { SongCredits, SongPitches } from "./SongPeople";
import { ShareToggle, StageConflictBanner } from "./CrewPanel";
import { FilesPanel } from "./FilesPanel";
import { canRenderInApp, dawOf } from "../lib/daws";
import { ConfirmButton, StatusSelect, TagEditor, btn, btnPrimary, input, sectionLabel } from "./ui";
import { Fact, Section } from "../ui";

const KEEP_BACKUPS = 5;

export function ProjectDrawer() {
  const detailPath = useAppStore((s) => s.detailPath);
  const project = useAppStore((s) => s.projects.find((p) => p.path === s.detailPath));
  const workspace = useAppStore((s) => s.workspace);
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const openDetail = useAppStore((s) => s.openDetail);
  const updateSong = useAppStore((s) => s.updateSong);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const addTracks = useAppStore((s) => s.addTracks);
  const removeTrack = useAppStore((s) => s.removeTrack);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const startRender = useAppStore((s) => s.startRender);
  const rendering = useAppStore((s) => s.rendering);
  const duplicateProject = useAppStore((s) => s.duplicateProject);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const trashBackups = useAppStore((s) => s.trashBackups);
  const startPackage = useAppStore((s) => s.startPackage);
  const packaging = useAppStore((s) => s.packaging);
  const openLaunchKit = useAppStore((s) => s.openLaunchKit);

  const [versionName, setVersionName] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showAllBackups, setShowAllBackups] = useState(false);
  /** Backups to clean up that sit on a drive with no Recycle Bin: waiting for an explicit OK. */
  const [permanent, setPermanent] = useState<{ project: string; paths: string[]; risky: number } | null>(null);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const meta of Object.values(workspace.songs))
      for (const t of meta.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [workspace.songs]);

  if (!detailPath || !project) return null;

  const meta = workspace.songs[project.path] ?? {};
  const detectedKey = detectKey(project.trackNames);
  const albums = albumsOf(workspace, project.path);
  const otherAlbums = workspace.albums.filter((a) => !albums.includes(a));
  const freshness = renderFreshness(project);
  const isFavorite = settings.favorites.includes(project.path);
  const latestRender = project.renders[0];
  const oldBackups = project.backups.slice(KEEP_BACKUPS);
  const visibleBackups = showAllBackups ? project.backups : project.backups.slice(0, 6);

  async function run(action: () => Promise<string | number>, ok: (r: string | number) => string) {
    setMessage(null);
    try {
      const result = await action();
      setMessage({ kind: "ok", text: ok(result) });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-rule bg-panel">
      <div className="flex items-start gap-2 border-b border-rule px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-cream">{project.name}</h2>
            <button onClick={() => toggleFavorite(project.path)} className="text-engrave hover:text-orange-300">
              <Star size={15} fill={isFavorite ? "currentColor" : "none"} className={isFavorite ? "text-orange-400" : ""} />
            </button>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-engrave" title={project.path}>
            {project.folder}
          </div>
        </div>
        <button onClick={() => openDetail(null)} className="rounded p-1 text-engrave hover:bg-rule hover:text-cream">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openInFlStudio(project.path).catch((e) => setMessage({ kind: "error", text: `Couldn't open it: ${e instanceof Error ? e.message : String(e)}` }))}
            disabled={demoMode}
            className={btnPrimary}
          >
            <PlayCircle size={14} /> Open in {dawOf(project).short === "FL" ? "FL" : dawOf(project).label}
          </button>
          <button onClick={() => revealInFileManager(project.path)} disabled={demoMode} className={btn}>
            <FolderOpen size={14} /> Reveal
          </button>
          <button onClick={() => openLaunchKit(project.path)} className={btn} title="Metadata, snippets, release date, captions">
            <Rocket size={14} /> Launch Kit
          </button>
          <button
            onClick={() => run(async () => (await startRender([project.path]), ""), () => "Render finished: see the panel at the bottom.")}
            disabled={demoMode || rendering || !canRenderInApp(project)}
            title={canRenderInApp(project) ? "Render a mixdown with FL Studio" : `Rendering from the app works with FL Studio. ${dawOf(project).exportTip}`}
            className={btn}
          >
            <Download size={14} /> Render
          </button>
          <button
            title="Zip the project with every sample it uses — FL opens it directly. For sharing, collabs or archiving."
            onClick={() => run(async () => (await startPackage([project.path]), ""), () => "Check the files to include in the panel at the bottom, then write the package.")}
            disabled={demoMode || packaging || !canRenderInApp(project)}
            className={btn}
          >
            <Package size={14} /> Package
          </button>
          {!meta.archived && (
            <button
              title="Hide from the library, board and stats. Nothing on disk changes."
              onClick={() => {
                updateSong(project.path, { archived: true });
                openDetail(null);
              }}
              className={btn}
            >
              <Archive size={14} /> Archive
            </button>
          )}
        </div>
        <ShareToggle path={project.path} />
        <StageConflictBanner path={project.path} />
        {project.readError && (
          <div className="mt-3 rounded-md border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/80">
            Couldn't read inside this project: {project.readError}. It's still tracked; tempo, samples and plugins are missing.
          </div>
        )}

        {message && (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-xs ${
              message.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}

        {meta.archived && (
          <div className="mt-3 flex items-center justify-between rounded-md border border-rule bg-panel px-3 py-2 text-xs text-body">
            Archived — hidden from the library, board and stats.
            <button onClick={() => updateSong(project.path, { archived: false })} className="text-cream hover:underline">
              Unarchive
            </button>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <div className={`${sectionLabel} mb-2`}>Stage</div>
            <StatusSelect value={meta.status} onChange={(status) => updateSong(project.path, { status })} />
          </div>
          <div>
            <div className={`${sectionLabel} mb-2`}>Key</div>
            <select
              value={meta.key ?? ""}
              onChange={(e) => updateSong(project.path, { key: e.target.value || undefined })}
              className="rounded-full border border-rule bg-panel px-2.5 py-1 text-xs text-body hover:bg-raised"
            >
              <option value="" className="bg-raised">
                Not set
              </option>
              {KEYS.map((k) => (
                <option key={k} value={k} className="bg-raised">
                  {k}
                </option>
              ))}
            </select>
            {!meta.key && detectedKey && (
              <button
                onClick={() => updateSong(project.path, { key: detectedKey })}
                title="Found in a mixer track name"
                className="ml-1.5 rounded-full border border-dashed border-rule-strong px-2 py-0.5 text-[11px] text-body hover:text-cream"
              >
                Use {detectedKey}?
              </button>
            )}
          </div>
        </div>

        <Section label="Releases">
          <div className="flex flex-wrap items-center gap-1.5">
            {albums.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-raised py-0.5 pl-1 pr-2 text-xs text-cream">
                <span className="h-4 w-4 rounded-full" style={{ background: a.color }} />
                <button onClick={() => openAlbum(a.id)} className="hover:underline">
                  {a.title}
                </button>
                <button onClick={() => removeTrack(a.id, project.path)} className="text-engrave hover:text-cream">
                  <X size={11} />
                </button>
              </span>
            ))}
            {otherAlbums.length > 0 && (
              <label className="relative flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-rule-strong px-2 py-0.5 text-[11px] text-engrave hover:text-body">
                <Plus size={11} /> Add to release
                <select
                  value=""
                  onChange={(e) => e.target.value && addTracks(e.target.value, [project.path])}
                  className="absolute inset-0 cursor-pointer opacity-0"
                >
                  <option value="" />
                  {otherAlbums.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {workspace.albums.length === 0 && <span className="text-xs text-engrave">No releases yet</span>}
          </div>
        </Section>

        <Section label="Tags">
          <TagEditor
            tags={meta.tags ?? []}
            suggestions={allTags}
            onChange={(tags) => updateSong(project.path, { tags })}
          />
        </Section>

        <Section label="Notes">
          <textarea
            value={meta.notes ?? ""}
            onChange={(e) => updateSong(project.path, { notes: e.target.value })}
            placeholder="Ideas, lyrics, what's left to do…"
            rows={4}
            className={`${input} resize-y text-xs leading-relaxed`}
          />
        </Section>

        <Section label="Project">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Fact label="Tempo" value={project.tempoBpm ? `${formatBpm(project.tempoBpm)} BPM` : "—"} />
            <Fact
              label="Time sig"
              value={project.timeSigNum ? `${project.timeSigNum}/${project.timeSigDenom}` : "—"}
            />
            <Fact label="Last saved" value={formatDateTime(project.modifiedAtMs)} />
            <Fact
              label={`${dawOf(project).label} version`}
              value={(project.flVersion?.split(".").slice(0, 3).join(".") ?? project.dawVersion?.replace(/^(Ableton Live|Studio One|REAPER)\s*/i, "")) || "—"}
            />
            <Fact
              label="Recordings"
              value={project.recordingsCount ? `${project.recordingsCount} · ${formatBytes(project.recordingsBytes)}` : "none"}
            />
            <Fact label="Project file" value={formatBytes(project.sizeBytes)} />
          </dl>
        </Section>

        <Section label="Credits">
          <SongCredits project={project} />
        </Section>

        <Section label={`Sent to · ${meta.pitches?.length ?? 0}`}>
          <SongPitches project={project} />
        </Section>

        <PluginsAndSamples project={project} />

        <Section label="Files">
          <FilesPanel project={project} />
        </Section>

        <Section label="Mixdown">
          {latestRender ? (
            <div className="rounded-lg border border-rule bg-panel p-3">
              <div className="flex items-center gap-2 text-xs">
                <Disc3 size={14} className="text-engrave" />
                <span className="min-w-0 flex-1 truncate text-cream">{fileName(latestRender.path)}</span>
                {freshness === "fresh" ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 size={12} /> Up to date
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle size={12} /> Older than project
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-engrave">
                Rendered {formatDateTime(latestRender.modifiedAtMs)} · {formatBytes(latestRender.sizeBytes)}
              </div>
              {!demoMode && (
                <audio controls preload="none" src={audioSrc(latestRender.path)} className="mt-2 h-8 w-full" />
              )}
              {project.renders.length > 1 && (
                <div className="mt-2 text-[11px] text-engrave">
                  +{project.renders.length - 1} other bounce{project.renders.length > 2 ? "s" : ""} in the folder
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-engrave">No mixdown yet — render it, or bounce it from FL next to the project.</div>
          )}
        </Section>

        <Section label={`Versions · ${project.backups.length} backups · ${formatBytes(backupsBytes(project))}`}>
          {versionName === null ? (
            <button onClick={() => setVersionName(`${project.name} v2`)} disabled={demoMode} className={btn}>
              <Copy size={14} /> Save as new version
            </button>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const name = versionName;
                setVersionName(null);
                run(() => duplicateProject(project.path, name), (p) => `Created ${fileName(String(p))}`);
              }}
            >
              <input autoFocus value={versionName} onChange={(e) => setVersionName(e.target.value)} className={`${input} py-1.5`} />
              <button type="submit" className={btn}>
                Create
              </button>
              <button type="button" onClick={() => setVersionName(null)} className="text-engrave hover:text-cream">
                <X size={14} />
              </button>
            </form>
          )}

          {project.backups.length > 0 && (
            <ol className="mt-3 border-l border-rule pl-3">
              {visibleBackups.map((b) => (
                <li key={b.path} className="group relative flex items-center gap-2 py-1 text-xs">
                  <span className="absolute -left-[15.5px] h-2 w-2 rounded-full bg-rule-strong" />
                  <History size={12} className="text-body" />
                  <span className="flex-1 text-body">{formatDateTime(b.modifiedAtMs)}</span>
                  <span className="text-body">{formatBytes(b.sizeBytes)}</span>
                  <button
                    title="Restore as a new file next to the project (the current version is untouched)"
                    disabled={demoMode}
                    onClick={() => run(() => restoreBackup(b.path, project.path), (p) => `Restored as ${fileName(String(p))}`)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-engrave opacity-0 hover:bg-rule hover:text-cream group-hover:opacity-100"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                </li>
              ))}
            </ol>
          )}
          {project.backups.length > visibleBackups.length && (
            <button onClick={() => setShowAllBackups(true)} className="mt-1 text-[11px] text-engrave hover:text-body">
              Show all {project.backups.length}
            </button>
          )}
          {oldBackups.length > 0 && (
            <ConfirmButton
              disabled={demoMode}
              label={
                <>
                  <Trash2 size={13} /> Clean up {oldBackups.length} older backups ({formatBytes(backupsBytes({ ...project, backups: oldBackups }))})
                </>
              }
              confirmLabel={`Move ${oldBackups.length} to ${trashName()}? Click again`}
              onConfirm={() =>
                run(
                  async () => {
                    const paths = oldBackups.map((b) => b.path);
                    // Removable or network drive: no Recycle Bin, so ask first.
                    const risky = await backupsOnRiskyVolumes(paths);
                    if (risky.length > 0) {
                      setPermanent({ project: project.path, paths, risky: risky.length });
                      return -1;
                    }
                    return trashBackups(paths);
                  },
                  (n) => (n === -1 ? "Nothing deleted yet: read the warning below." : `Moved ${n} backups to the ${trashName()}`),
                )
              }
              className={`${btn} mt-3 text-xs`}
            />
          )}
          {permanent && permanent.project === project.path && (
            <div className="mt-2 rounded-md border border-red-400/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200/90">
              {permanent.risky === permanent.paths.length ? "These backups are" : `${permanent.risky} of these backups are`} on a removable or
              network drive, which has no {trashName()}: they would be <b className="font-semibold">deleted permanently</b>.
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    const paths = permanent.paths;
                    setPermanent(null);
                    void run(() => trashBackups(paths, true), (n) => `Deleted ${n} backups`);
                  }}
                  className="rounded border border-red-400/40 px-2 py-1 text-red-200 hover:bg-red-500/10"
                >
                  Delete permanently
                </button>
                <button onClick={() => setPermanent(null)} className="rounded border border-rule-strong px-2 py-1 text-body hover:bg-raised">
                  Keep them
                </button>
              </div>
            </div>
          )}
          {oldBackups.length > 0 && (
            <div className="mt-1 text-[11px] text-engrave">Keeps the {KEEP_BACKUPS} most recent.</div>
          )}
        </Section>
      </div>
    </aside>
  );
}

function PluginsAndSamples({ project }: { project: ProjectInfo }) {
  const [showSamples, setShowSamples] = useState(false);
  const missingP = missingPlugins(project);
  const thirdParty = project.plugins.filter((p) => p.installed !== null);
  const native = project.plugins.filter((p) => p.installed === null);
  const counts = { ok: 0, relocated: 0, missing: 0 };
  for (const s of project.samples) counts[s.status]++;
  const problemSamples = project.samples.filter((s) => s.status !== "ok");
  const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;

  return (
    <>
      <Section label={`Plugins · ${project.plugins.length}`}>
        {missingP.length > 0 && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            Not installed on this computer: {missingP.map((p) => p.name).join(", ")}
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {thirdParty.map((p) => (
            <span
              key={p.name}
              title={p.vendor ?? undefined}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                p.installed ? "bg-rule text-cream" : "bg-red-500/15 text-red-300 line-through decoration-red-400/60"
              }`}
            >
              {p.name}
            </span>
          ))}
          {native.map((p) => (
            <span key={p.name} className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-body">
              {p.name}
            </span>
          ))}
          {project.plugins.length === 0 && <span className="text-xs text-engrave">None found</span>}
        </div>
      </Section>

      <Section label={`Samples · ${project.samples.length}`}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1 text-body">
            <CheckCircle2 size={12} className="text-emerald-400" /> {counts.ok} found
          </span>
          {counts.relocated > 0 && (
            <span className="flex items-center gap-1 text-body" title="Not at the stored path, but a file with the same name is in this song's folder — the project was moved. FL can usually find these.">
              <FolderInput size={12} className="text-sky-400" /> {counts.relocated} moved
            </span>
          )}
          {counts.missing > 0 && (
            <span className="flex items-center gap-1 text-red-300">
              <AlertTriangle size={12} /> {counts.missing} missing
            </span>
          )}
        </div>
        {problemSamples.length > 0 && (
          <>
            <button onClick={() => setShowSamples(!showSamples)} className="mt-1.5 text-[11px] text-engrave hover:text-body">
              {showSamples ? "Hide" : "Show"} {problemSamples.length} not at their stored path
            </button>
            {showSamples && (
              <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-auto text-[11px]">
                {problemSamples.map((s) => (
                  <li key={s.path} title={s.path} className={`truncate ${s.status === "missing" ? "text-red-300" : "text-body"}`}>
                    {s.status === "missing" ? "✕" : "↪"} {fileName(s.path)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>
    </>
  );
}
