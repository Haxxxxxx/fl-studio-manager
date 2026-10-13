import { StatusDot } from "fl-manager-ui";

const STAGES: [string, string][] = [
  ["Unsorted", "#5b5b63"],
  ["Creation", "#1c5cab"],
  ["Production", "#2a78d6"],
  ["Prep", "#5598e7"],
  ["Release", "#86b6ef"],
  ["Promotion", "#b7d3f6"],
];

export const Stages = () => (
  <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
    {STAGES.map(([label, color]) => (
      <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)" }}>
        <StatusDot color={color} /> {label}
      </span>
    ))}
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <StatusDot color="#2a78d6" size={6} />
    <StatusDot color="#2a78d6" />
    <StatusDot color="#2a78d6" size={12} />
  </div>
);
