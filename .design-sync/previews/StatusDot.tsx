import { StatusDot } from "fl-manager-ui";

const STAGES: [string, string][] = [
  ["Unsorted", "#6F6F78"],
  ["Creation", "#F5A524"],
  ["Production", "#D6409F"],
  ["Prep", "#8E4EC6"],
  ["Release", "#30A46C"],
  ["Promotion", "#00A2C7"],
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
    <StatusDot color="#D6409F" size={6} />
    <StatusDot color="#D6409F" />
    <StatusDot color="#D6409F" size={12} />
  </div>
);
