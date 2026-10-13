import { FieldRow } from "fl-manager-ui";

const noop = () => {};
const box = { width: 520 };

export const Detected = () => (
  <div style={box}>
    <FieldRow
      field={{ id: "artists", label: "Artist(s)", value: "Ana", source: "detected", note: "From the song's credits", kind: "text" }}
      onChange={noop}
    />
  </div>
);

export const NeedsYou = () => (
  <div style={box}>
    <FieldRow
      field={{
        id: "explicit",
        label: "Explicit lyrics",
        value: "",
        source: "missing",
        note: "Can't be detected from audio. Answer once",
        kind: "choice",
        options: ["Yes", "No"],
        check: { level: "missing", message: "Explicit lyrics? Yes or No" },
      }}
      onChange={noop}
    />
  </div>
);

export const Suggested = () => (
  <div style={box}>
    <FieldRow
      field={{
        id: "releaseDate",
        label: "Release date",
        value: "2026-11-13",
        source: "suggested",
        note: "First Friday 28+ days out: time to deliver to the distributor and pitch to Spotify editorial",
        kind: "date",
      }}
      onChange={noop}
    />
  </div>
);

export const EditedWithWarning = () => (
  <div style={box}>
    <FieldRow
      field={{
        id: "songwriters",
        label: "Songwriters",
        value: "Ana Diaz (lyrics) 60%; Cleo Martin (music) 30%",
        source: "edited",
        note: "You changed this",
        kind: "text",
        check: { level: "warn", message: "Splits add up to 90%, not 100%" },
      }}
      onChange={noop}
    />
  </div>
);

export const AiReviewed = () => (
  <div style={box}>
    <FieldRow
      field={{
        id: "genre",
        label: "Genre",
        value: "Hip-Hop/Rap",
        source: "suggested",
        note: "Crew default. Change it if this one's different",
        kind: "text",
        review: { verdict: "check", confidence: 0.55, reason: "Trap drums and 140 BPM read more like Trap", suggestion: "Trap", checkedValue: "Hip-Hop/Rap", stale: false },
      }}
      onChange={noop}
    />
  </div>
);
