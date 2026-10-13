import { Avatar } from "fl-manager-ui";

export const Crew = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <Avatar name="Ana Diaz" />
    <Avatar name="Ben Okafor" />
    <Avatar name="Cleo" />
    <Avatar name="Milo Vance" />
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <Avatar name="Ana Diaz" size={24} />
    <Avatar name="Ana Diaz" size={36} />
    <Avatar name="Ana Diaz" size={56} />
  </div>
);
