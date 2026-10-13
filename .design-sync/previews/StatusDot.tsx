import { StatusDot } from "fl-manager-ui";

const STAGES: [string, string][] = [
  ["Unsorted", "#5B5B63"],
  ["Creation", "#1C5CAB"],
  ["Production", "#2A78D6"],
  ["Prep", "#5598E7"],
  ["Release", "#86B6EF"],
  ["Promotion", "#B7D3F6"],
];

export const Stages = () => (
  <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
    {STAGES.map(([label, color]) => (
      <span key={label} style={{ display: "flex", alignItems: "center", gap: 8, color: "#f2efe8" }}>
        <StatusDot color={color} /> {label}
      </span>
    ))}
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <StatusDot color="#2A78D6" size={6} />
    <StatusDot color="#2A78D6" />
    <StatusDot color="#2A78D6" size={12} />
  </div>
);

// Signal LEDs, and an unlit one (glow off) for "off" states.
export const Signal = () => (
  <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: '"IBM Plex Mono", monospace', textTransform: "uppercase", letterSpacing: "0.08em", color: "#f2efe8" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StatusDot color="#3ddc84" /> Mix current
    </span>
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StatusDot color="#ffc233" /> Outdated
    </span>
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StatusDot color="#ff4040" /> Missing
    </span>
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StatusDot color="#3d3c37" glow={false} /> Off
    </span>
  </div>
);
