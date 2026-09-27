import type { ProjectInfo } from "../types";

const ROOTS = [
  { root: "/Users/you/FL Studio Projects/Beats", folder: "Beats" },
  { root: "/Users/you/FL Studio Projects/Vocals", folder: "Vocals" },
  { root: "/Users/you/FL Studio Projects/Mixes", folder: "Mixes" },
  { root: "/Users/you/FL Studio Projects/WIP", folder: "WIP" },
];

const ADJECTIVES = [
  "Midnight",
  "Neon",
  "Velvet",
  "Solar",
  "Ghost",
  "Crimson",
  "Analog",
  "Static",
  "Hollow",
  "Golden",
  "Electric",
  "Silent",
];

const NOUNS = [
  "Drift",
  "Pulse",
  "Horizon",
  "Echo",
  "Circuit",
  "Bloom",
  "Tide",
  "Mirage",
  "Signal",
  "Fever",
  "Orbit",
  "Static",
];

const GENRES = ["Trap", "Lo-Fi", "House", "Drill", "Ambient", null, null];
const ARTISTS = ["You", "You ft. Kadence", "You x Milo", null];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value / 0x7fffffff;
  };
}

export function generateSampleProjects(count = 28): ProjectInfo[] {
  const rand = seededRandom(42);
  const now = Date.now();
  const projects: ProjectInfo[] = [];

  for (let i = 0; i < count; i++) {
    const rootInfo = ROOTS[Math.floor(rand() * ROOTS.length)];
    const adjective = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(rand() * NOUNS.length)];
    const suffix = rand() > 0.7 ? ` v${1 + Math.floor(rand() * 3)}` : "";
    const name = `${adjective} ${noun}${suffix}`;

    // Weight recency: most projects skew toward the last ~60 days, a long tail back to a year.
    const ageDays = Math.floor(-Math.log(1 - rand() * 0.999) * 25);
    const modifiedAtMs = now - Math.min(ageDays, 365) * 24 * 60 * 60 * 1000;

    const sizeBytes = Math.floor((0.5 + rand() * 12) * 1024 * 1024);
    const genre = GENRES[Math.floor(rand() * GENRES.length)];
    const artist = ARTISTS[Math.floor(rand() * ARTISTS.length)];
    const tempoBpm = Math.round((80 + rand() * 90) * 10) / 10;
    const timeSigNum = rand() > 0.85 ? 3 : 4;

    projects.push({
      path: `${rootInfo.root}/${name}.flp`,
      name,
      folder: rootInfo.root,
      sizeBytes,
      modifiedAtMs,
      root: rootInfo.root,
      genre,
      artist,
      tempoBpm,
      timeSigNum,
      timeSigDenom: 4,
      flVersion: "21.2.3.4004",
    });
  }

  return projects.sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);
}

export const SAMPLE_WATCHED_FOLDERS = ROOTS.map((r) => r.root);
