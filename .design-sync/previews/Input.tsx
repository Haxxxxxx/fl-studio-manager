import { Input } from "fl-manager-ui";

export const Empty = () => (
  <div style={{ width: 360 }}>
    <Input placeholder="Your email" />
  </div>
);

export const Filled = () => (
  <div style={{ width: 360 }}>
    <Input defaultValue="Night Crew" aria-label="Crew name" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 360 }}>
    <Input defaultValue="ana@example.com" disabled />
  </div>
);
