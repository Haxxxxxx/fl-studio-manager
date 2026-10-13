import { Card, StatTile, Theme } from "fl-manager-ui";
import { Music2 } from "lucide-react";

export const Screen = () => (
  <Theme padded>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 420 }}>
      <StatTile icon={<Music2 size={15} />} label="Songs" value={48} />
      <Card title="Notes">
        <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Everything sits on the app's near-black surface.</p>
      </Card>
    </div>
  </Theme>
);
