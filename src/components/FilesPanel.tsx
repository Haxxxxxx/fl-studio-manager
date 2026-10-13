import { useEffect, useState } from "react";
import { Clapperboard, Disc3, FileAudio, FolderOpen, History, Image, Mic, Music2, Package, Rocket } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { cleanTitle } from "../lib/launchKit";
import { formatBytes, formatRelative } from "../lib/format";
import type { ProjectInfo } from "../types";

// Roadmap 1a: "a clear view of where each track's files live". Everything a
// song has on disk, in one place, each with Reveal.

const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;
const join = (dir: string, name: string) => `${dir}${dir.includes("\\") ? "\\" : "/"}${name}`;

function kitIcon(relative: string) {
  if (relative.startsWith("shorts/")) return <Clapperboard size={13} />;
  if (relative.startsWith("snippets/")) return <FileAudio size={13} />;
  if (/\.(jpe?g|png)$/i.test(relative)) return <Image size={13} />;
  if (/\.(wav|mp3|flac|ogg)$/i.test(relative)) return <Disc3 size={13} />;
  return <Package size={13} />;
}

export function FilesPanel({ project }: { project: ProjectInfo }) {
  const settings = useAppStore((s) => s.settings);
  const meta = useAppStore((s) => s.workspace.songs[project.path]);
  const demoMode = useAppStore((s) => s.demoMode);
  const openLaunchKit = useAppStore((s) => s.openLaunchKit);
  const [kit, setKit] = useState<api.KitFile[] | null>(null);
  // The kit folder is named after the kit's title (as the export does).
  const kitTitle = meta?.launchKit?.edits?.title || cleanTitle(project.name) || project.name;

  useEffect(() => {
    let live = true;
    if (demoMode || !settings.outputFolder) return setKit([]);
    api
      .kitFiles(settings.outputFolder, kitTitle)
      .then((files) => live && setKit(files ?? []))
      .catch(() => live && setKit([]));
    return () => {
      live = false;
    };
  }, [settings.outputFolder, kitTitle, demoMode, project.modifiedAtMs]);

  const reveal = (path: string) => void api.revealInFileManager(path).catch(() => {});
  const audioDir = join(project.folder, "Audio");
  const backupsSize = project.backups.reduce((t, b) => t + b.sizeBytes, 0);

  return (
    <div className="flex flex-col gap-1 text-xs">
      <Row icon={<Music2 size={13} />} label="Project" detail={`${fileName(project.path)} · ${formatBytes(project.sizeBytes)}`} onReveal={demoMode ? undefined : () => reveal(project.path)} />
      <Row
        icon={<History size={13} />}
        label="Backups"
        detail={project.backups.length ? `${project.backups.length} in Backup/ · ${formatBytes(backupsSize)}` : "none yet"}
        onReveal={project.backups[0] && !demoMode ? () => reveal(project.backups[0].path) : undefined}
      />
      <Row
        icon={<Mic size={13} />}
        label="Recorded takes"
        detail={project.recordingsCount ? `${project.recordingsCount} in Audio/ · ${formatBytes(project.recordingsBytes)}` : "none"}
        onReveal={project.recordingsCount && !demoMode ? () => reveal(audioDir) : undefined}
      />
      {project.renders.length === 0 ? (
        <Row icon={<Disc3 size={13} />} label="Mixdowns" detail="none yet" />
      ) : (
        project.renders.slice(0, 4).map((r, i) => (
          <Row
            key={r.path}
            icon={<Disc3 size={13} />}
            label={i === 0 ? "Mixdowns" : ""}
            detail={`${fileName(r.path)} · ${formatBytes(r.sizeBytes)} · ${formatRelative(r.modifiedAtMs)}`}
            onReveal={demoMode ? undefined : () => reveal(r.path)}
          />
        ))
      )}
      {project.renders.length > 4 && <div className="pl-[118px] text-[11px] text-white/35">+{project.renders.length - 4} older mixdowns</div>}

      <div className="mt-2 border-t border-white/5 pt-2">
        {!settings.outputFolder ? (
          <Row icon={<Rocket size={13} />} label="Launch Kit" detail="set an export folder in Settings" />
        ) : kit === null ? (
          <Row icon={<Rocket size={13} />} label="Launch Kit" detail="looking…" />
        ) : kit.length === 0 ? (
          <div className="flex items-center gap-2">
            <Row icon={<Rocket size={13} />} label="Launch Kit" detail="not exported yet" />
            <button onClick={() => openLaunchKit(project.path)} className="ml-auto shrink-0 text-[11px] text-white/45 hover:text-white">
              Open Launch Kit →
            </button>
          </div>
        ) : (
          <>
            <Row icon={<Rocket size={13} />} label="Launch Kit" detail={`${kit.length} files in Launch Kits/${kitTitle}`} onReveal={() => reveal(kit[0].path)} />
            {kit.map((f) => (
              <Row key={f.path} icon={kitIcon(f.relative)} label="" detail={`${f.relative} · ${formatBytes(f.sizeBytes)}`} onReveal={() => reveal(f.path)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, detail, onReveal }: { icon: React.ReactNode; label: string; detail: string; onReveal?: () => void }) {
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-white/[0.03]">
      <span className="text-white/35">{icon}</span>
      <span className="w-[92px] shrink-0 text-white/55">{label}</span>
      <span className="min-w-0 flex-1 truncate text-white/75" title={detail}>
        {detail}
      </span>
      {onReveal && (
        <button onClick={onReveal} title="Show in folder" className="shrink-0 rounded p-0.5 text-white/30 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100">
          <FolderOpen size={12} />
        </button>
      )}
    </div>
  );
}
