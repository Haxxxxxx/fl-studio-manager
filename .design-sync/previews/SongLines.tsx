import { SongLines } from "fl-manager-ui";

export const Upcoming = () => (
  <div style={{ width: 420 }}>
    <SongLines
      items={[
        { id: "1", title: "Night Run", sub: "Ana feat. Ben", right: "2026-11-13" },
        { id: "2", title: "Cold Summer", sub: "Cleo", right: "2026-11-27" },
        { id: "3", title: "Ghost Mode", sub: "You", right: "2026-12-04" },
      ]}
      onOpen={() => {}}
    />
  </div>
);

export const Stalled = () => (
  <div style={{ width: 420 }}>
    <SongLines
      items={[
        { id: "4", title: "Paper Planes", sub: "Milo", right: "34 days" },
        { id: "5", title: "Blue Hour", right: "22 days" },
      ]}
      onOpen={() => {}}
    />
  </div>
);
