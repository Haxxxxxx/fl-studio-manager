import type { DawId } from "../types";
import { dict, tr } from "../i18n";

// The DAWs Hivo reads projects from (src-tauri/src/daws.rs). What the
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

// Menu paths stay as the DAWs show them (English in most installs); the
// sentence around them follows the app's language.
const TIPS = dict(
  {
    "fl-studio": "In FL Studio: File → Export → Wave file, 44,100 Hz, 24-bit.",
    ableton: "In Ableton: File → Export Audio/Video, WAV, 44.1 kHz, 24-bit.",
    reaper: "In REAPER: File → Render, WAV, 44.1 kHz, 24-bit.",
    "studio-one": "In Studio One: Song → Export Mixdown, WAV, 44.1 kHz, 24-bit.",
    "pro-tools": "In Pro Tools: File → Bounce Mix, WAV, 44.1 kHz, 24-bit (interleaved).",
    cubase: "In Cubase: File → Export → Audio Mixdown, WAV, 44.1 kHz, 24-bit.",
    bitwig: "In Bitwig: File → Export Audio, WAV, 44.1 kHz, 24-bit.",
    bandlab: "A BandLab sketch has no project to render: export the mix from BandLab as WAV, or continue it in FL Studio.",
  },
  {
    "fl-studio": "Dans FL Studio : File → Export → Wave file, 44 100 Hz, 24 bits.",
    ableton: "Dans Ableton : File → Export Audio/Video, WAV, 44,1 kHz, 24 bits.",
    reaper: "Dans REAPER : File → Render, WAV, 44,1 kHz, 24 bits.",
    "studio-one": "Dans Studio One : Song → Export Mixdown, WAV, 44,1 kHz, 24 bits.",
    "pro-tools": "Dans Pro Tools : File → Bounce Mix, WAV, 44,1 kHz, 24 bits (interleaved).",
    cubase: "Dans Cubase : File → Export → Audio Mixdown, WAV, 44,1 kHz, 24 bits.",
    bitwig: "Dans Bitwig : File → Export Audio, WAV, 44,1 kHz, 24 bits.",
    bandlab: "Un sketch BandLab n'a pas de projet à rendre : exporte le mix en WAV depuis BandLab, ou continue-le dans FL Studio.",
  },
);

function daw(id: DawId, label: string, short: string, readable: DawInfo["readable"]): DawInfo {
  return Object.defineProperty({ id, label, short, readable }, "exportTip", { enumerable: true, get: () => tr(TIPS)[id] }) as DawInfo;
}

export const DAWS: Record<DawId, DawInfo> = {
  "fl-studio": daw("fl-studio", "FL Studio", "FL", "full"),
  ableton: daw("ableton", "Ableton Live", "Live", "full"),
  reaper: daw("reaper", "REAPER", "REAPER", "full"),
  "studio-one": daw("studio-one", "Studio One", "S1", "partial"),
  "pro-tools": daw("pro-tools", "Pro Tools", "PT", "none"),
  cubase: daw("cubase", "Cubase", "Cubase", "none"),
  bitwig: daw("bitwig", "Bitwig Studio", "Bitwig", "none"),
  bandlab: daw("bandlab", "BandLab sketch", "BL", "none"),
};

/** Projects from older scans (before multi-DAW) are FL Studio. */
export function dawOf(project: { daw?: DawId | null }): DawInfo {
  return DAWS[project.daw ?? "fl-studio"] ?? DAWS["fl-studio"];
}

const PROJECT_EXT = /\.(flp|als|rpp|song|ptx|ptf|cpr|npr|bwproject)$/i;

/** "Envy.als" → "Envy", for any DAW's project file. */
export const stripProjectExt = (fileName: string) => fileName.replace(PROJECT_EXT, "");

/** A BandLab sketch: audio in `<song>/BandLab/`, no project yet. Its path is
 * that folder, so it can't be opened in a DAW (reveal it instead). */
export const isSketch = (project: { daw?: DawId | null }) => project.daw === "bandlab";

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
