import { FileRow } from "fl-manager-ui";
import { Disc3, History, Layers, Mic, Music2 } from "lucide-react";

const reveal = () => {};

export const SongFiles = () => (
  <div style={{ width: 460, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
    <FileRow icon={<Music2 size={13} />} label="Project" detail="Night Run.flp · 87.9 KB" onReveal={reveal} />
    <FileRow icon={<History size={13} />} label="Backups" detail="4 in Backup/ · 312 KB" onReveal={reveal} />
    <FileRow icon={<Mic size={13} />} label="Recorded takes" detail="3 in Audio/ · 21.0 MB" onReveal={reveal} />
    <FileRow icon={<Layers size={13} />} label="Stems" detail="12 in Night Run Stems · 410 MB · today" onReveal={reveal} />
    <FileRow icon={<Disc3 size={13} />} label="Mixdowns" detail="Night Run.wav · 38.1 MB · today" onReveal={reveal} />
  </div>
);

export const Missing = () => (
  <div style={{ width: 460, fontSize: 12 }}>
    <FileRow icon={<Layers size={13} />} label="Stems" detail="none exported (a Stems folder, or FL's split mixer tracks)" />
  </div>
);
