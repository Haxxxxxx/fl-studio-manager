import { Stat } from "fl-manager-ui";

export const ReleaseStats = () => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 140px)", gap: 8 }}>
    <Stat label="Tracks" value="6" />
    <Stat label="Runtime" value="18:42" />
    <Stat label="Release" value="Dec 4" />
  </div>
);
