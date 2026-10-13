import { useState } from "react";
import { StatusSelect } from "fl-manager-ui";

type Stage = "creation" | "production" | "prep" | "release" | "promotion" | undefined;

export const Interactive = () => {
  const [stage, setStage] = useState<Stage>("production");
  return <StatusSelect value={stage} onChange={setStage} />;
};

export const AllStages = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {(["creation", "production", "prep", "release", "promotion", undefined] as Stage[]).map((s) => (
      <StatusSelect key={s ?? "none"} value={s} onChange={() => {}} />
    ))}
  </div>
);

export const Compact = () => <StatusSelect value="prep" onChange={() => {}} compact />;
