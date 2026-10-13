import { LogoMark } from "fl-manager-ui";

// The hive cell at the sizes the app ships: app icon, header, favicon.
export const Sizes = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
    <LogoMark size={96} />
    <LogoMark size={48} />
    <LogoMark size={32} />
    <LogoMark size={16} />
  </div>
);

// On cream grounds: black outline, the LED stays orange.
export const OnLight = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "flex-end", background: "#f2efe8", padding: 20, borderRadius: 4, width: "fit-content" }}>
    <LogoMark size={96} tone="light" />
    <LogoMark size={32} tone="light" />
    <LogoMark size={16} tone="light" />
  </div>
);
