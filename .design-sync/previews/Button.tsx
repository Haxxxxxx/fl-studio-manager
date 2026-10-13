import { Button } from "fl-manager-ui";

export const Primary = () => <Button variant="primary">Export kit</Button>;

export const Secondary = () => <Button>Accept all</Button>;

export const Disabled = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Button variant="primary" disabled>
      Exporting…
    </Button>
    <Button disabled>Accepted</Button>
  </div>
);

export const Toolbar = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <Button>Render 3 shorts</Button>
    <Button>Package</Button>
    <Button variant="primary">New song</Button>
  </div>
);
