import { Wordmark, engrave } from "fl-manager-ui";

// The sidebar header: wordmark over an engraved tagline.
export const Header = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <Wordmark size={30} />
    <span className={engrave}>Session → release</span>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 32, alignItems: "flex-end" }}>
    <Wordmark size={72} />
    <Wordmark size={40} />
    <Wordmark size={24} />
  </div>
);

export const OnLight = () => (
  <div style={{ background: "#f2efe8", padding: "20px 28px", borderRadius: 4, width: "fit-content" }}>
    <Wordmark size={56} tone="light" />
  </div>
);
