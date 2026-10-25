// System 02 tokens, mirrored from the desktop's src/theme.css. Keep in sync.
import { Platform } from "react-native";

export const C = {
  chassis: "#0d0d0c",
  panel: "#161614",
  raised: "#1f1f1c",
  rule: "#2c2b27",
  ruleStrong: "#3d3c37",
  cream: "#f2efe8",
  body: "#c9c5bb",
  engrave: "#8d897f",
  hot: "#ff5a1f",
  hotHover: "#ff7a47",
  ok: "#3ddc84",
  warn: "#ffc233",
  missing: "#ff4040",
} as const;

/** Stage LEDs: one blue ramp (conventions.md). */
export const STAGE_COLOR: Record<string, string> = {
  creation: "#1C5CAB",
  production: "#2A78D6",
  prep: "#5598E7",
  release: "#86B6EF",
  promotion: "#B7D3F6",
};
export const UNSORTED_COLOR = "#5B5B63";

export const RADIUS = 4;

export const FONT = {
  /** Barlow Condensed SemiBold, loaded in App.tsx; falls back to the system font. */
  display: "BarlowCondensed_600SemiBold",
  mono: Platform.select({ ios: "Menlo", default: "monospace" }),
};

/** The engraved label: small mono caps. */
export const engrave = {
  fontFamily: FONT.mono,
  fontSize: 10.5,
  letterSpacing: 1.4,
  textTransform: "uppercase" as const,
  color: C.engrave,
};
