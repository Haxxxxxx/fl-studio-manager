import type { DawId } from "../types";

// The DAWs FL Manager reads projects from (src-tauri/src/daws.rs). What the
// app can do with a project depends on its DAW: rendering from the app uses
// FL Studio's command-line renderer, and packages are FL's flat .flp + samples zips.

export interface DawInfo {
  id: DawId;
  label: string;
  /** Short badge text for dense rows. */
  short: string;
  /** What's read from inside the project file. */
  readable: "full" | "partial" | "none";
  /** Export settings tip for a distributor-ready master. */
  exportTip: string;
}

const MASTER = "WAV, 44.1 kHz, 24-bit";

export const DAWS: Record<DawId, DawInfo> = {
  "fl-studio": { id: "fl-studio", label: "FL Studio", short: "FL", readable: "full", exportTip: `In FL Studio: File → Export → Wave file, 44,100 Hz, 24-bit.` },
  ableton: { id: "ableton", label: "Ableton Live", short: "Live", readable: "full", exportTip: `In Ableton: File → Export Audio/Video, ${MASTER}.` },
  reaper: { id: "reaper", label: "REAPER", short: "REAPER", readable: "full", exportTip: `In REAPER: File → Render, ${MASTER}.` },
  "studio-one": { id: "studio-one", label: "Studio One", short: "S1", readable: "partial", exportTip: `In Studio One: Song → Export Mixdown, ${MASTER}.` },
  "pro-tools": { id: "pro-tools", label: "Pro Tools", short: "PT", readable: "none", exportTip: `In Pro Tools: File → Bounce Mix, ${MASTER} (interleaved).` },
  cubase: { id: "cubase", label: "Cubase", short: "Cubase", readable: "none", exportTip: `In Cubase: File → Export → Audio Mixdown, ${MASTER}.` },
  bitwig: { id: "bitwig", label: "Bitwig Studio", short: "Bitwig", readable: "none", exportTip: `In Bitwig: File → Export Audio, ${MASTER}.` },
};

/** Projects from older scans (before multi-DAW) are FL Studio. */
export function dawOf(project: { daw?: DawId | null }): DawInfo {
  return DAWS[project.daw ?? "fl-studio"] ?? DAWS["fl-studio"];
}

const PROJECT_EXT = /\.(flp|als|rpp|song|ptx|ptf|cpr|npr|bwproject)$/i;

/** "Envy.als" → "Envy", for any DAW's project file. */
export const stripProjectExt = (fileName: string) => fileName.replace(PROJECT_EXT, "");

/** Rendering and packaging from the app need FL Studio. */
export const canRenderInApp = (project: { daw?: DawId | null }) => dawOf(project).id === "fl-studio";

/** Splits a render request into FL projects (rendered in the app) and the
 *  rest. `names`, when given, lines up with `paths` and is filtered the same
 *  way, since the backend matches names to projects by position. */
export function splitRenderable<P extends { daw?: DawId | null }>(
  paths: string[],
  byPath: Map<string, P>,
  names?: string[],
): { paths: string[]; names?: string[]; skipped: string[] } {
  const keep = paths.map((p) => canRenderInApp(byPath.get(p) ?? {}));
  return {
    paths: paths.filter((_, i) => keep[i]),
    names: names?.filter((_, i) => keep[i]),
    skipped: paths.filter((_, i) => !keep[i]),
  };
}
