import { useEffect, useState } from "react";
import { Clapperboard, Disc3, FileAudio, History, Image, Layers, Mic, Music2, Package, Rocket } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { kitTitleFor } from "../lib/launchKit";
import { formatBytes, formatRelative } from "../lib/format";
import type { ProjectInfo } from "../types";
import { FileRow } from "../ui";

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
  const kitTitle = kitTitleFor(project, meta);

  useEffect(() => {
    let live = true;
    if (demoMode || !settings.outputFolder) return setKit([]);
    api
      .kitFiles(kitTitle)
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
      <FileRow icon={<Music2 size={13} />} label="Project" detail={`${fileName(project.path)} · ${formatBytes(project.sizeBytes)}`} onReveal={demoMode ? undefined : () => reveal(project.path)} />
      <FileRow
        icon={<History size={13} />}
        label="Backups"
        detail={project.backups.length ? `${project.backups.length} backups · ${formatBytes(backupsSize)}` : "none yet"}
        onReveal={project.backups[0] && !demoMode ? () => reveal(project.backups[0].path) : undefined}
      />
      <FileRow
        icon={<Mic size={13} />}
        label="Recorded takes"
        detail={project.recordingsCount ? `${project.recordingsCount} in Audio/ · ${formatBytes(project.recordingsBytes)}` : "none"}
        onReveal={project.recordingsCount && !demoMode ? () => reveal(audioDir) : undefined}
      />
      <FileRow
        icon={<Layers size={13} />}
        label="Stems"
        detail={
          project.stems
            ? `${project.stems.count} in ${fileName(project.stems.folder) || "the project folder"} · ${formatBytes(project.stems.bytes)} · ${formatRelative(project.stems.newestMs)}`
            : "none exported (a Stems folder, or FL's split mixer tracks)"
        }
        onReveal={project.stems && !demoMode ? () => reveal(project.stems!.folder) : undefined}
      />
      {project.renders.length === 0 ? (
        <FileRow icon={<Disc3 size={13} />} label="Mixdowns" detail="none yet" />
      ) : (
        project.renders.slice(0, 4).map((r, i) => (
          <FileRow
            key={r.path}
            icon={<Disc3 size={13} />}
            label={i === 0 ? "Mixdowns" : ""}
            detail={`${fileName(r.path)} · ${formatBytes(r.sizeBytes)} · ${formatRelative(r.modifiedAtMs)}`}
            onReveal={demoMode ? undefined : () => reveal(r.path)}
          />
        ))
      )}
      {project.renders.length > 4 && <div className="pl-[118px] text-[11px] text-engrave">+{project.renders.length - 4} older mixdowns</div>}

      <div className="mt-2 border-t border-rule pt-2">
        {!settings.outputFolder ? (
          <FileRow icon={<Rocket size={13} />} label="Launch Kit" detail="set an export folder in Settings" />
        ) : kit === null ? (
          <FileRow icon={<Rocket size={13} />} label="Launch Kit" detail="looking…" />
        ) : kit.length === 0 ? (
          <div className="flex items-center gap-2">
            <FileRow icon={<Rocket size={13} />} label="Launch Kit" detail="not exported yet" />
            <button onClick={() => openLaunchKit(project.path)} className="ml-auto shrink-0 text-[11px] text-body hover:text-cream">
              Open Launch Kit →
            </button>
          </div>
        ) : (
          <>
            <FileRow icon={<Rocket size={13} />} label="Launch Kit" detail={`${kit.length} files in Launch Kits/${kitTitle}`} onReveal={() => reveal(kit[0].path)} />
            {kit.map((f) => (
              <FileRow key={f.path} icon={kitIcon(f.relative)} label="" detail={`${f.relative} · ${formatBytes(f.sizeBytes)}`} onReveal={() => reveal(f.path)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
