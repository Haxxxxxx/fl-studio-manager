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
      <span key={label} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)" }}>
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
