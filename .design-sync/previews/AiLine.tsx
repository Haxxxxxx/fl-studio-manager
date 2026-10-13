import { AiLine } from "fl-manager-ui";

const noop = () => {};

export const LooksRight = () => (
  <AiLine review={{ verdict: "ok", confidence: 0.92, reason: "Matches the credits", checkedValue: "Ana", stale: false }} onUse={noop} />
);

export const WorthALook = () => (
  <AiLine
    review={{ verdict: "check", confidence: 0.55, reason: "Trap drums and 140 BPM read more like Trap", suggestion: "Trap", checkedValue: "Hip-Hop/Rap", stale: false }}
    onUse={noop}
  />
);

export const LooksWrong = () => (
  <AiLine
    review={{ verdict: "wrong", confidence: 0.81, reason: "The release date is a Tuesday", suggestion: "2026-11-13", checkedValue: "2026-11-10", stale: false }}
    onUse={noop}
  />
);

export const Stale = () => (
  <AiLine review={{ verdict: "check", confidence: 0.7, reason: "Title looks like a file name", checkedValue: "night_run_v3", stale: true }} onUse={noop} />
);
