import { Button, Card, SongLines } from "fl-manager-ui";

export const WithList = () => (
  <div style={{ width: 420 }}>
    <Card title="Coming out">
      <SongLines
        items={[
          { id: "1", title: "Night Run", sub: "Ana feat. Ben", right: "2026-11-13" },
          { id: "2", title: "Cold Summer", sub: "Cleo", right: "2026-11-27" },
          { id: "3", title: "Ghost Mode", sub: "You", right: "2026-12-04" },
        ]}
        onOpen={() => {}}
      />
    </Card>
  </div>
);

export const WithAction = () => (
  <div style={{ width: 420 }}>
    <Card title="Pick up where you left off" action={<Button>New song</Button>}>
      <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
        Paper Planes was saved 2 days ago and is still in Production.
      </p>
    </Card>
  </div>
);

export const Empty = () => (
  <div style={{ width: 420 }}>
    <Card title="Stalled: no save or move in 21+ days">
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Everything in Creation or Production moved recently.</p>
    </Card>
  </div>
);
