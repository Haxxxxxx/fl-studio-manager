import { Meter } from "fl-manager-ui";

export const Readiness = () => (
  <div style={{ width: 280, fontSize: 12, display: "flex", flexDirection: "column", gap: 10 }}>
    <Meter label="Mixdowns" value={4} total={6} />
    <Meter label="Launch Kits accepted" value={2} total={6} />
    <Meter label="Covers" value={6} total={6} />
  </div>
);
