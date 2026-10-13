import { useState } from "react";
import { Chip } from "fl-manager-ui";

export const FilterRow = () => {
  const [active, setActive] = useState("All");
  const opts = ["All 48", "Creation 12", "Production 9", "Prep 6", "Unsorted 21"];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {opts.map((o) => (
        <Chip key={o} active={active === o.split(" ")[0]} onClick={() => setActive(o.split(" ")[0])}>
          {o}
        </Chip>
      ))}
    </div>
  );
};

export const States = () => (
  <div style={{ display: "flex", gap: 4 }}>
    <Chip active onClick={() => {}}>Active</Chip>
    <Chip active={false} onClick={() => {}}>Inactive</Chip>
  </div>
);
