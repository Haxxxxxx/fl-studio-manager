import { StatTile } from "fl-manager-ui";
import { Disc3, Music2, Sparkles, Trophy } from "lucide-react";

export const DashboardRow = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 170px)", gap: 12 }}>
    <StatTile icon={<Music2 size={15} />} label="Songs" value={48} />
    <StatTile icon={<Sparkles size={15} />} label="In progress" value={12} />
    <StatTile icon={<Trophy size={15} />} label="Finished" value={9} />
    <StatTile icon={<Disc3 size={15} />} label="Releases" value={3} />
  </div>
);

export const Single = () => (
  <div style={{ width: 200 }}>
    <StatTile icon={<Music2 size={15} />} label="Shared songs" value={21} />
  </div>
);
