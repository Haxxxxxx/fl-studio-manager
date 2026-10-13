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
import { TRASH_NAME, formatBytes, formatDateTime } from "../lib/format";
import { audioSrc, openInFlStudio, revealInFileManager } from "../lib/tauri";
import { KEYS, albumsOf, backupsBytes, formatBpm, missingPlugins, renderFreshness } from "../lib/songs";
import type { ProjectInfo } from "../types";
import { detectKey } from "../lib/people";
import { SongCredits, SongPitches } from "./SongPeople";
import { ShareToggle } from "./CrewPanel";
import { FilesPanel } from "./FilesPanel";
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
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-white/10 bg-[#131318]">
      <div className="flex items-start gap-2 border-b border-white/10 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-white">{project.name}</h2>
            <button onClick={() => toggleFavorite(project.path)} className="text-white/50 hover:text-orange-300">
              <Star size={15} fill={isFavorite ? "currentColor" : "none"} className={isFavorite ? "text-orange-400" : ""} />
            </button>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-white/55" title={project.path}>
            {project.folder}
          </div>
        </div>
        <button onClick={() => openDetail(null)} className="rounded p-1 text-white/58 hover:bg-white/10 hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openInFlStudio(project.path)} disabled={demoMode} className={btnPrimary}>
            <PlayCircle size={14} /> Open in FL
          </button>
          <button onClick={() => revealInFileManager(project.path)} disabled={demoMode} className={btn}>
            <FolderOpen size={14} /> Reveal
          </button>
          <button onClick={() => openLaunchKit(project.path)} className={btn} title="Metadata, snippets, release date, captions">
            <Rocket size={14} /> Launch Kit
          </button>
          <button
            onClick={() => run(async () => (await startRender([project.path]), ""), () => "Render started")}
            disabled={demoMode || rendering}
            className={btn}
          >
            <Download size={14} /> Render
          </button>
          <button
            title="Zip the project with every sample it uses — FL opens it directly. For sharing, collabs or archiving."
            onClick={() => run(async () => (await startPackage([project.path]), ""), () => "Package created — see the panel at the bottom.")}
            disabled={demoMode || packaging}
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
          <div className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60">
            Archived — hidden from the library, board and stats.
            <button onClick={() => updateSong(project.path, { archived: false })} className="text-white/80 hover:underline">
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
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/75 hover:bg-white/[0.08]"
            >
              <option value="" className="bg-[#18181d]">
                Not set
              </option>
              {KEYS.map((k) => (
                <option key={k} value={k} className="bg-[#18181d]">
                  {k}
                </option>
              ))}
            </select>
            {!meta.key && detectedKey && (
              <button
                onClick={() => updateSong(project.path, { key: detectedKey })}
                title="Found in a mixer track name"
                className="ml-1.5 rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[11px] text-white/60 hover:text-white"
              >
                Use {detectedKey}?
              </button>
            )}
          </div>
        </div>

        <Section label="Releases">
          <div className="flex flex-wrap items-center gap-1.5">
            {albums.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-0.5 pl-1 pr-2 text-xs text-white/80">
                <span className="h-4 w-4 rounded-full" style={{ background: a.color }} />
                <button onClick={() => openAlbum(a.id)} className="hover:underline">
                  {a.title}
                </button>
                <button onClick={() => removeTrack(a.id, project.path)} className="text-white/55 hover:text-white">
                  <X size={11} />
                </button>
              </span>
            ))}
            {otherAlbums.length > 0 && (
              <label className="relative flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-white/15 px-2 py-0.5 text-[11px] text-white/58 hover:text-white/70">
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
            {workspace.albums.length === 0 && <span className="text-xs text-white/50">No releases yet</span>}
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
            <Fact label="FL version" value={project.flVersion?.split(".").slice(0, 3).join(".") ?? "—"} />
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
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2 text-xs">
                <Disc3 size={14} className="text-white/58" />
                <span className="min-w-0 flex-1 truncate text-white/80">{fileName(latestRender.path)}</span>
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
              <div className="mt-1 text-[11px] text-white/55">
                Rendered {formatDateTime(latestRender.modifiedAtMs)} · {formatBytes(latestRender.sizeBytes)}
              </div>
              {!demoMode && (
                <audio controls preload="none" src={audioSrc(latestRender.path)} className="mt-2 h-8 w-full" />
              )}
              {project.renders.length > 1 && (
                <div className="mt-2 text-[11px] text-white/55">
                  +{project.renders.length - 1} other bounce{project.renders.length > 2 ? "s" : ""} in the folder
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-white/55">No mixdown yet — render it, or bounce it from FL next to the project.</div>
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
              <button type="button" onClick={() => setVersionName(null)} className="text-white/58 hover:text-white">
                <X size={14} />
              </button>
            </form>
          )}

          {project.backups.length > 0 && (
            <ol className="mt-3 border-l border-white/10 pl-3">
              {visibleBackups.map((b) => (
                <li key={b.path} className="group relative flex items-center gap-2 py-1 text-xs">
                  <span className="absolute -left-[15.5px] h-2 w-2 rounded-full bg-white/20" />
                  <History size={12} className="text-white/45" />
                  <span className="flex-1 text-white/60">{formatDateTime(b.modifiedAtMs)}</span>
                  <span className="text-white/45">{formatBytes(b.sizeBytes)}</span>
                  <button
                    title="Restore as a new file next to the project (the current version is untouched)"
                    disabled={demoMode}
                    onClick={() => run(() => restoreBackup(b.path, project.path), (p) => `Restored as ${fileName(String(p))}`)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-white/58 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                  >
                    <RotateCcw size={11} /> Restore
                  </button>
                </li>
              ))}
            </ol>
          )}
          {project.backups.length > visibleBackups.length && (
            <button onClick={() => setShowAllBackups(true)} className="mt-1 text-[11px] text-white/58 hover:text-white/70">
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
              confirmLabel={`Move ${oldBackups.length} to ${TRASH_NAME}? Click again`}
              onConfirm={() => run(() => trashBackups(oldBackups.map((b) => b.path)), (n) => `Moved ${n} backups to the ${TRASH_NAME}`)}
              className={`${btn} mt-3 text-xs`}
            />
          )}
          {oldBackups.length > 0 && (
            <div className="mt-1 text-[11px] text-white/50">Keeps the {KEEP_BACKUPS} most recent.</div>
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
                p.installed ? "bg-white/10 text-white/80" : "bg-red-500/15 text-red-300 line-through decoration-red-400/60"
              }`}
            >
              {p.name}
            </span>
          ))}
          {native.map((p) => (
            <span key={p.name} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-white/62">
              {p.name}
            </span>
          ))}
          {project.plugins.length === 0 && <span className="text-xs text-white/50">None found</span>}
        </div>
      </Section>

      <Section label={`Samples · ${project.samples.length}`}>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1 text-white/60">
            <CheckCircle2 size={12} className="text-emerald-400" /> {counts.ok} found
          </span>
          {counts.relocated > 0 && (
            <span className="flex items-center gap-1 text-white/60" title="Not at the stored path, but a file with the same name is in this song's folder — the project was moved. FL can usually find these.">
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
            <button onClick={() => setShowSamples(!showSamples)} className="mt-1.5 text-[11px] text-white/58 hover:text-white/70">
              {showSamples ? "Hide" : "Show"} {problemSamples.length} not at their stored path
            </button>
            {showSamples && (
              <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-auto text-[11px]">
                {problemSamples.map((s) => (
                  <li key={s.path} title={s.path} className={`truncate ${s.status === "missing" ? "text-red-300" : "text-white/62"}`}>
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
