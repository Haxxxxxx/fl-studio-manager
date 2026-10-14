import { describe, expect, it } from "vitest";
import type { CrewSongRow, ProjectInfo, Workspace } from "../types";
import { stalledSongs } from "./crew";
import { crewStats } from "./crewStats";
import { lastSaveMs } from "./songs";

const NOW = Date.UTC(2026, 9, 14, 12);
const DAY = 864e5;
const song = (name: string, savedDaysAgo: number, backupsDaysAgo: number[] = []) =>
  ({
    path: `/p/${name}.flp`,
    name,
    modifiedAtMs: savedDaysAgo < 0 ? 0 : NOW - savedDaysAgo * DAY,
    backups: backupsDaysAgo.map((d, i) => ({ path: `/p/Backup/${name} ${i}.flp`, sizeBytes: 1, modifiedAtMs: NOW - d * DAY })),
    renders: [],
    plugins: [],
    samples: [],
  }) as unknown as ProjectInfo;
const ws = (songs: Workspace["songs"]): Workspace => ({ version: 2, songs, albums: [], people: [] });

describe("stalled songs (no save in 21+ days, still being made)", () => {
  const songs = [
    song("Fresh", 2),
    song("Old file, autosaved yesterday", 60, [1, 40]),
    song("Old", 30),
    song("Older", 90, [70]),
    song("Exactly 21", 21),
    song("20 days", 20),
    song("Old but in Prep", 80),
    song("Old but unsorted", 80),
    song("No date", -1),
  ];
  const meta = ws({
    "/p/Fresh.flp": { status: "creation" },
    "/p/Old file, autosaved yesterday.flp": { status: "production" },
    "/p/Old.flp": { status: "creation" },
    "/p/Older.flp": { status: "production" },
    "/p/Exactly 21.flp": { status: "creation" },
    "/p/20 days.flp": { status: "creation" },
    "/p/Old but in Prep.flp": { status: "prep" },
    "/p/No date.flp": { status: "creation" },
  });

  it("lists exactly the old ones, oldest first", () => {
    const got = stalledSongs(songs, meta, NOW).map((s) => [s.song.name, s.idleDays]);
    expect(got).toEqual([
      ["Older", 70],
      ["Old", 30],
      ["Exactly 21", 21],
    ]);
  });

  it("counts FL's backups as saves", () => {
    expect(lastSaveMs(song("x", 60, [1, 40]))).toBe(NOW - DAY);
    expect(lastSaveMs(song("x", -1))).toBe(0);
  });
});

describe("crew stalled card", () => {
  const row = (title: string, stage: CrewSongRow["stage"], saved: number | null, moved: number | null = null) =>
    ({
      id: title,
      title,
      stage,
      owner_id: "u1",
      last_saved_at: saved == null ? null : new Date(NOW - saved * DAY).toISOString(),
      stage_updated_at: moved == null ? null : new Date(NOW - moved * DAY).toISOString(),
    }) as unknown as CrewSongRow;

  it("skips songs with no known date instead of showing them decades old", () => {
    const stats = crewStats(
      [row("Old", "creation", 40), row("Recent", "production", 3), row("Unknown", "creation", null), row("Moved lately", "creation", 50, 2)],
      [],
      NOW,
    );
    expect(stats.stalled.map((s) => [s.song.title, s.days])).toEqual([["Old", 40]]);
  });
});
