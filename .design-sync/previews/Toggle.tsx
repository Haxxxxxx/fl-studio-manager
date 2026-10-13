import { useState } from "react";
import { Toggle } from "fl-manager-ui";

export const Favorites = () => {
  const [on, setOn] = useState(true);
  return (
    <Toggle active={on} onClick={() => setOn(!on)}>
      Favorites
    </Toggle>
  );
};

export const States = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Toggle active onClick={() => {}}>Problems only</Toggle>
    <Toggle active={false} onClick={() => {}}>Archived</Toggle>
  </div>
);
