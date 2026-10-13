import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Disc3, Download, Package, Plus, Search, Trash2, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatRelative } from "../lib/format";
import { ALBUM_COLORS, STATUSES, UNSORTED, formatBpm, isFinished, renderFreshness, statusInfo } from "../lib/songs";
import type { Album, AlbumKind, ProjectInfo, Workspace } from "../types";
import { ConfirmButton, Modal, StatusDot, StatusSelect, btn, btnPrimary, input, sectionLabel } from "./ui";
import { MixdownBadge, Stat } from "../ui";

const KINDS: { id: AlbumKind; label: string }[] = [
  { id: "album", label: "Album" },
  { id: "ep", label: "EP" },
  { id: "mixtape", label: "Mixtape" },
  { id: "single", label: "Single" },
];

function kindLabel(kind: AlbumKind) {
  return KINDS.find((k) => k.id === kind)?.label ?? kind;
}

function tracksOf(album: Album, projects: ProjectInfo[]): (ProjectInfo | null)[] {
  const byPath = new Map(projects.map((p) => [p.path, p]));
  // A track whose project file was moved/renamed shows as missing rather than vanishing.
  return album.trackPaths.map((path) => byPath.get(path) ?? null);
}

export function AlbumsView() {
  const openAlbumId = useAppStore((s) => s.openAlbumId);
  const album = useAppStore((s) => s.workspace.albums.find((a) => a.id === s.openAlbumId));
  return openAlbumId && album ? <AlbumDetail album={album} /> : <AlbumGrid />;
}

function AlbumGrid() {
  const workspace = useAppStore((s) => s.workspace);
  const projects = useAppStore((s) => s.projects);
  const createAlbum = useAppStore((s) => s.createAlbum);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-auto px-8 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Albums & releases</h1>
            <p className="text-sm text-white/40">Group songs into albums, EPs and mixtapes, track progress toward release.</p>
          </div>
          {draft === null && (
            <button onClick={() => setDraft("")} className={btnPrimary}>
              <Plus size={14} /> New release
            </button>
          )}
        </div>

        {draft !== null && (
          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = createAlbum(draft);
              setDraft(null);
              openAlbum(id);
            }}
          >
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Release title" className={input} />
            <button type="submit" className={btnPrimary}>
              Create
            </button>
            <button type="button" onClick={() => setDraft(null)} className={btn}>
              Cancel
            </button>
          </form>
        )}

        {workspace.albums.length === 0 && draft === null ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center text-white/35">
            <Disc3 size={32} />
            <div className="text-sm">No releases yet. Create one and add songs from your library.</div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
            {workspace.albums.map((album) => (
              <AlbumCard key={album.id} album={album} projects={projects} workspace={workspace} onOpen={() => openAlbum(album.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlbumCard({
  album,
  projects,
  workspace,
  onOpen,
}: {
  album: Album;
  projects: ProjectInfo[];
  workspace: Workspace;
  onOpen: () => void;
}) {
  const tracks = tracksOf(album, projects);
  const done = album.trackPaths.filter((p) => isFinished(workspace.songs[p]?.status)).length;
  return (
    <button onClick={onOpen} className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-white/20">
      <Cover album={album} />
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="truncate font-medium text-white/90">{album.title}</div>
        <div className="shrink-0 text-[11px] uppercase text-white/35">{kindLabel(album.kind)}</div>
      </div>
      <div className="mt-0.5 text-xs text-white/40">
        {tracks.length} track{tracks.length === 1 ? "" : "s"} · {done} done
        {album.releaseDate && ` · ${formatRelative(new Date(album.releaseDate).getTime())}`}
      </div>
      <div className="mt-2">
        <ProgressBar trackPaths={album.trackPaths} workspace={workspace} height={6} />
      </div>
    </button>
  );
}

function Cover({ album, size = "w-full" }: { album: Album; size?: string }) {
  const initials = album.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div
      className={`${size} flex aspect-square items-end rounded-lg p-3`}
      style={{ background: `linear-gradient(135deg, ${album.color} 0%, ${album.color}55 55%, #16161b 100%)` }}
    >
      <span className="text-3xl font-bold tracking-tight text-white/90">{initials}</span>
    </div>
  );
}

/** Segmented bar: songs per pipeline stage, ordinal colors, 2px gaps. */
export function ProgressBar({ trackPaths, workspace, height = 10 }: { trackPaths: string[]; workspace: Workspace; height?: number }) {
  const segments = [{ id: undefined, ...UNSORTED }, ...STATUSES]
    .map((s) => ({ ...s, count: trackPaths.filter((p) => workspace.songs[p]?.status === s.id).length }))
    .filter((s) => s.count > 0);
  if (trackPaths.length === 0) return <div className="rounded-full bg-white/5" style={{ height }} />;
  return (
    <div className="flex gap-[2px]" style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={s.label}
          title={`${s.label}: ${s.count}`}
          style={{ flexGrow: s.count, background: s.color }}
          className={`${i === 0 ? "rounded-l-full" : ""} ${i === segments.length - 1 ? "rounded-r-full" : ""}`}
        />
      ))}
    </div>
  );
}

function AlbumDetail({ album }: { album: Album }) {
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const updateAlbum = useAppStore((s) => s.updateAlbum);
  const deleteAlbum = useAppStore((s) => s.deleteAlbum);
  const removeTrack = useAppStore((s) => s.removeTrack);
  const moveTrack = useAppStore((s) => s.moveTrack);
  const updateSong = useAppStore((s) => s.updateSong);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const openDetail = useAppStore((s) => s.openDetail);
  const openNewProject = useAppStore((s) => s.openNewProject);
  const startRender = useAppStore((s) => s.startRender);
  const rendering = useAppStore((s) => s.rendering);
  const demoMode = useAppStore((s) => s.demoMode);
  const startPackage = useAppStore((s) => s.startPackage);
  const packaging = useAppStore((s) => s.packaging);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tracks = tracksOf(album, projects);
  const present = tracks.filter((t): t is ProjectInfo => t !== null);
  const done = album.trackPaths.filter((p) => isFinished(workspace.songs[p]?.status)).length;
  const mixed = present.filter((t) => renderFreshness(t) === "fresh").length;
  const bpms = present.map((t) => t.tempoBpm).filter((b): b is number => b != null);
  const releaseMs = album.releaseDate ? new Date(album.releaseDate).getTime() : null;

  async function exportAlbum() {
    setError(null);
    const numbered = tracks
      .map((t, i) => (t ? { path: t.path, name: `${String(i + 1).padStart(2, "0")} - ${t.name}` } : null))
      .filter((t): t is { path: string; name: string } => t !== null);
    try {
      await startRender(
        numbered.map((t) => t.path),
        { subfolder: album.title, names: numbered.map((t) => t.name) },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-w-0 flex-1 overflow-auto px-8 py-6">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => openAlbum(null)} className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80">
          <ArrowLeft size={13} /> All releases
        </button>

        <div className="mt-4 flex gap-6">
          <div className="w-44 shrink-0">
            <Cover album={album} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ALBUM_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateAlbum(album.id, { color: c })}
                  className={`h-5 w-5 rounded-full ${album.color === c ? "ring-2 ring-white/70 ring-offset-2 ring-offset-[#0f0f12]" : ""}`}
                  style={{ background: c }}
                  aria-label={`Cover color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <select
                value={album.kind}
                onChange={(e) => updateAlbum(album.id, { kind: e.target.value as AlbumKind })}
                className="rounded border border-white/10 bg-transparent px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-white/50"
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id} className="bg-[#18181d]">
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={album.title}
              onChange={(e) => updateAlbum(album.id, { title: e.target.value })}
              className="mt-1 w-full bg-transparent text-2xl font-semibold text-white focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-white/50">
              <label className="flex items-center gap-1.5">
                <span className="text-white/40">Release date</span>
                <input
                  type="date"
                  value={album.releaseDate ?? ""}
                  onChange={(e) => updateAlbum(album.id, { releaseDate: e.target.value || null })}
                  className="bg-transparent text-white/70 focus:outline-none"
                />
              </label>
              {releaseMs && (
                <span className={releaseMs < Date.now() ? "text-white/40" : "text-orange-300"}>
                  {releaseMs < Date.now() ? "released" : "release"} {formatRelative(releaseMs)}
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <Stat label="Tracks" value={String(album.trackPaths.length)} />
              <Stat label="Done" value={`${done}/${album.trackPaths.length}`} />
              <Stat label="Mixdowns current" value={`${mixed}/${present.length}`} />
              <Stat
                label="BPM range"
                value={bpms.length ? `${formatBpm(Math.min(...bpms))}–${formatBpm(Math.max(...bpms))}` : "—"}
              />
            </div>

            <div className="mt-4">
              <ProgressBar trackPaths={album.trackPaths} workspace={workspace} />
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/45">
                {[{ id: undefined, ...UNSORTED }, ...STATUSES].map((s) => {
                  const n = album.trackPaths.filter((p) => workspace.songs[p]?.status === s.id).length;
                  return n ? (
                    <span key={s.label} className="flex items-center gap-1">
                      <StatusDot color={s.color} /> {s.label} {n}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <div className={sectionLabel}>Tracklist</div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setPicking(true)} className={btn}>
              <Plus size={14} /> Add songs
            </button>
            <button onClick={() => openNewProject({ albumId: album.id, status: "creation" })} className={btn}>
              <Plus size={14} /> New song for this release
            </button>
            <button
              onClick={() =>
                startPackage(present.map((t) => t.path), album.title).catch((e) =>
                  setError(e instanceof Error ? e.message : String(e)),
                )
              }
              disabled={demoMode || packaging || present.length === 0}
              className={btn}
              title="Zip every track with its samples into <export folder>/Packages/<release title> — for a mix engineer, a collaborator, or archiving"
            >
              <Package size={14} /> Package release
            </button>
            <button
              onClick={exportAlbum}
              disabled={demoMode || rendering || present.length === 0}
              className={btnPrimary}
              title="Render every track, numbered, into <export folder>/<release title>"
            >
              <Download size={14} /> Export release
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}

        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          {tracks.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-white/35">No tracks yet — add songs from your library.</div>
          )}
          {tracks.map((t, i) => {
            const path = album.trackPaths[i];
            return (
              <div key={path} className="group flex items-center gap-3 border-b border-white/5 px-3 py-2 text-sm last:border-0 hover:bg-white/[0.03]">
                <span className="w-6 text-right tabular-nums text-white/30">{i + 1}</span>
                <div className="flex flex-col opacity-0 group-hover:opacity-100">
                  <button onClick={() => moveTrack(album.id, i, i - 1)} disabled={i === 0} className="text-white/40 hover:text-white disabled:opacity-20">
                    <ArrowUp size={11} />
                  </button>
                  <button
                    onClick={() => moveTrack(album.id, i, i + 1)}
                    disabled={i === tracks.length - 1}
                    className="text-white/40 hover:text-white disabled:opacity-20"
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
                {t ? (
                  <>
                    <button onClick={() => openDetail(t.path)} className="min-w-0 flex-1 truncate text-left font-medium text-white/90 hover:underline">
                      {t.name}
                    </button>
                    <StatusSelect compact value={workspace.songs[t.path]?.status} onChange={(status) => updateSong(t.path, { status })} />
                    <span className="w-10 text-right text-xs text-white/55">{workspace.songs[t.path]?.key ?? "—"}</span>
                    <span className="w-14 text-right tabular-nums text-xs text-white/45">{formatBpm(t.tempoBpm)}</span>
                    <span className="w-20">
                      <MixdownBadge project={t} />
                    </span>
                  </>
                ) : (
                  <span className="flex-1 truncate text-white/35" title={path}>
                    Missing: {path.split(/[/\\]/).pop()} (moved or renamed?)
                  </span>
                )}
                <button onClick={() => removeTrack(album.id, path)} title="Remove from release" className="text-white/25 opacity-0 hover:text-white group-hover:opacity-100">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className={`${sectionLabel} mt-8`}>Notes</div>
        <textarea
          value={album.notes}
          onChange={(e) => updateAlbum(album.id, { notes: e.target.value })}
          placeholder="Concept, artwork ideas, features, release plan…"
          rows={4}
          className={`${input} mt-2 resize-y text-sm`}
        />

        <div className="mt-8 border-t border-white/5 pt-4">
          <ConfirmButton
            label={
              <>
                <Trash2 size={13} /> Delete release
              </>
            }
            confirmLabel="Delete? The songs themselves are kept. Click again"
            onConfirm={() => deleteAlbum(album.id)}
            className={`${btn} text-xs`}
          />
        </div>
      </div>

      {picking && <TrackPicker album={album} onClose={() => setPicking(false)} />}
    </div>
  );
}

function TrackPicker({ album, onClose }: { album: Album; onClose: () => void }) {
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const addTracks = useAppStore((s) => s.addTracks);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) => !p.isTemplate && !album.trackPaths.includes(p.path) && (!q || p.name.toLowerCase().includes(q)),
    );
  }, [projects, album.trackPaths, query]);

  return (
    <Modal title={`Add songs to ${album.title}`} onClose={onClose}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs" className={`${input} pl-8`} />
      </div>
      <div className="mt-3 max-h-80 overflow-auto">
        {candidates.map((p) => {
          const on = picked.includes(p.path);
          const status = statusInfo(workspace.songs[p.path]?.status);
          return (
            <label key={p.path} className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm ${on ? "bg-orange-500/10" : "hover:bg-white/5"}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => setPicked(on ? picked.filter((x) => x !== p.path) : [...picked, p.path])}
                className="accent-orange-500"
              />
              <span className="flex-1 truncate text-white/85">{p.name}</span>
              <span className="flex items-center gap-1 text-[11px] text-white/40">
                <StatusDot color={status.color} size={6} /> {status.label}
              </span>
            </label>
          );
        })}
        {candidates.length === 0 && <div className="py-6 text-center text-sm text-white/35">Nothing to add</div>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btn}>
          Cancel
        </button>
        <button
          disabled={picked.length === 0}
          onClick={() => {
            addTracks(album.id, picked);
            onClose();
          }}
          className={btnPrimary}
        >
          Add {picked.length || ""} song{picked.length === 1 ? "" : "s"}
        </button>
      </div>
    </Modal>
  );
}
