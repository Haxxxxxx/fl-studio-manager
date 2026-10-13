import type { Person, ProjectInfo, Workspace } from "../types";

// ---- Collaborators, from mixer track / recorded take names ----
// FL names recordings after the mixer track, and people name tracks after
// who's on them: "Lead Voices - Nova", "Voice 1 NV", "Lead Voice Kairo".

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match ("K" matches "Lead - K", not "Kick"). */
function mentions(trackName: string, alias: string): boolean {
  const a = alias.trim();
  if (!a) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(a)}(?![\\p{L}\\p{N}])`, "iu").test(trackName);
}

export function personNames(p: Person): string[] {
  return [p.name, ...p.aliases];
}

/** People whose name or an alias appears in the song's track names. */
export function detectedPeople(song: ProjectInfo, people: Person[]): Person[] {
  return people.filter((person) =>
    personNames(person).some((alias) => song.trackNames.some((t) => mentions(t, alias))),
  );
}

/** Songs a person is on: credited explicitly, or detected in track names. */
export function songsOf(person: Person, songs: ProjectInfo[], ws: Workspace) {
  return songs
    .map((song) => {
      const credit = ws.songs[song.path]?.credits?.find((c) => c.personId === person.id);
      const detected = personNames(person).some((a) => song.trackNames.some((t) => mentions(t, a)));
      return { song, credit, detected };
    })
    .filter((x) => x.credit || x.detected);
}

// Words that describe the track, not a person.
const STOP = new Set(
  "voice voices vox lead main second third other reverb chorus ambiance ambiances amb ambs vst bus instru instrumental prod ref couplet talking part rec backs bacs adlibs adlib harmony harmonies double dbl left right mono stereo fx drums bass kick snare hat hats piano guitar synth pad beat verse hook intro outro bridge refrain autotune"
    .split(" "),
);

function candidateFrom(track: string): string | null {
  // "Lead Voices - Nova" → "Nova"
  const dash = track.lastIndexOf(" - ");
  let tail = dash >= 0 ? track.slice(dash + 3) : "";
  // "Lead Voice Kairo" / "Voice 1 NV" / "Lead voice Lil Ember" → the words
  // after the voice word, minus take numbers.
  if (!tail) {
    const words = track.split(/\s+/);
    const vi = words.findIndex((w) => /^voices?$/i.test(w));
    if (vi >= 0) tail = words.slice(vi + 1).filter((w) => !/^\d+$/.test(w)).join(" ");
  }
  tail = tail.trim();
  if (!tail || tail.length > 20 || /^\d/.test(tail)) return null;
  const words = tail.toLowerCase().split(/\s+/);
  if (words.every((w) => STOP.has(w) || /^\d+$/.test(w))) return null;
  if (words.length > 2) return null;
  return tail;
}

/** Names that show up in track names but aren't a person yet, most songs first. */
export function suggestedPeople(songs: ProjectInfo[], people: Person[]): { name: string; songs: number }[] {
  const known = people.flatMap(personNames).map((n) => n.toLowerCase());
  const counts = new Map<string, { name: string; songs: Set<string> }>();
  for (const song of songs) {
    for (const t of song.trackNames) {
      const c = candidateFrom(t);
      if (!c || known.includes(c.toLowerCase())) continue;
      const k = c.toLowerCase();
      const entry = counts.get(k) ?? { name: c, songs: new Set<string>() };
      entry.songs.add(song.path);
      counts.set(k, entry);
    }
  }
  return [...counts.values()]
    .map((e) => ({ name: e.name, songs: e.songs.size }))
    .sort((a, b) => b.songs - a.songs);
}

// ---- Keys, from mixer track names ("E MAJOR", "B♭ minor - 102") ----

const TO_KEY_NOTE: Record<string, string> = {
  "C": "C", "C#": "C#", "DB": "C#", "D": "D", "D#": "Eb", "EB": "Eb", "E": "E", "F": "F",
  "F#": "F#", "GB": "F#", "G": "G", "G#": "Ab", "AB": "Ab", "A": "A", "A#": "Bb", "BB": "Bb", "B": "B",
};

/** A key written into a track name, in the app's notation ("Bbm"), or null. */
export function detectKey(trackNames: string[]): string | null {
  for (const t of trackNames) {
    const m = /^\s*([A-G])\s*([#♯b♭])?\s*(major|maj|minor|min)\b/i.exec(t);
    if (!m) continue;
    const accidental = m[2] ? (m[2] === "#" || m[2] === "♯" ? "#" : "B") : "";
    const note = TO_KEY_NOTE[m[1].toUpperCase() + accidental];
    if (!note) continue;
    return /^min/i.test(m[3]) ? `${note}m` : note;
  }
  return null;
}
