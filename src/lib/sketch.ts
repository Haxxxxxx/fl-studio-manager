import { cleanTitle } from "./launchKit";

// BandLab sketches (src-tauri/src/sketch.rs): a phone export imported as a
// song in a project folder, `<song>/BandLab/`, until "Continue in FL Studio".

/** Same list as `SKETCH_AUDIO_EXTS` in src-tauri/src/sketch.rs. */
export const SKETCH_AUDIO_EXTS = ["wav", "mp3", "m4a", "aac", "flac", "ogg", "aif", "aiff"];

/** An audio file a sketch or a memo can hold (not a zip of stems). */
export function isSketchAudioName(name: string): boolean {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase();
  return !!ext && SKETCH_AUDIO_EXTS.includes(ext);
}

/** Same limit as the link field's `maxLength`. */
export const MAX_BANDLAB_URL = 300;

/** Characters a folder name can't hold (actions.rs `validate_name`). */
const NOT_IN_NAMES = /[/\\:*?"<>|]/g;

/** "Night_Run (Mixdown) v2.mp3" → "Night Run": a song name from a picked
 * file's name (extension, underscores and version tags dropped, characters
 * a folder can't hold removed). "" when nothing usable is left. */
export function songNameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]{1,5}$/i, "");
  // BandLab's own export suffixes, then the usual version tags.
  const bare = stem.replace(/[\s_-]*[([]?\b(bandlab|mixdown|mix|master|export|stems?)\b[)\]]?$/i, "");
  const name = cleanTitle(bare.replace(NOT_IN_NAMES, " ")).replace(/\s+/g, " ").trim();
  return name === "." || name === ".." ? "" : name.slice(0, 100).trim();
}

/** The BandLab link to save: trimmed, https, at most 300 characters, no
 * spaces. "" for an empty field; null when it isn't a usable link. */
export function cleanBandlabUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return "";
  if (url.length > MAX_BANDLAB_URL || /\s/.test(url) || !url.toLowerCase().startsWith("https://")) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname ? url : null;
  } catch {
    return null;
  }
}
