import { SourceBadge } from "fl-manager-ui";

// Where a Launch Kit value came from. Sources differ by shape, not just hue.
export const AllSources = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <SourceBadge source="detected" />
    <SourceBadge source="suggested" />
    <SourceBadge source="ai" />
    <SourceBadge source="edited" />
    <SourceBadge source="missing" />
  </div>
);

// In context: a field's label row.
export const InFieldLabel = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "#c9c5bb", fontWeight: 500 }}>BPM</span>
      <SourceBadge source="detected" />
      <span style={{ color: "#8d897f" }}>From the project's tempo</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "#c9c5bb", fontWeight: 500 }}>ISRC</span>
      <SourceBadge source="missing" />
      <span style={{ color: "#8d897f" }}>From your distributor after upload</span>
    </div>
  </div>
);
