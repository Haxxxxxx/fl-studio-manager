import { describe, expect, it } from "vitest";
import type { CrewSongRow, ProjectInfo, Workspace } from "../types";
import {
  localStageMoves,
  orphanedShares,
  remoteStageMoves,
  shareElsewhere,
  sharedCredits,
  sharedHere,
  sharedPayloads,
  sharedTags,
  sharedTitle,
  staleShareIds,
} from "./crewSync";

// Regression tests for the crew-sync review (data loss and rewound moves).

const ME = "user-me";
const CREW = "crew-a";
const scope = { crewId: CREW, userId: ME };
const ws = (songs: Workspace["songs"]): Workspace => ({ version: 2, songs, albums: [], people: [] });
const row = (id: string, over: Partial<CrewSongRow> = {}): CrewSongRow => ({
  id,
  crew_id: CREW,
  owner_id: ME,
  title: id,
  stage: "production",
  bpm: null,
  musical_key: null,
  tags: [],
  credits: [],
  release_date: null,
  has_mixdown: false,
  kit_accepted: false,
  last_saved_at: null,
  stage_updated_at: "2026-10-10T00:00:00Z",
  ...over,
});
const project = (path: string) =>
  ({ path, name: path.split("/").pop()!.replace(".flp", ""), tempoBpm: 140, renders: [], modifiedAtMs: 0 }) as unknown as ProjectInfo;

describe("staleShareIds (what gets deleted)", () => {
  it("deletes only songs this workspace explicitly unshared", () => {
    const local = ws({ "/a.flp": { shared: false, shareId: "s1", shareCrewId: CREW, shareUserId: ME } });
    expect(staleShareIds([row("s1")], local, scope)).toEqual(["s1"]);
  });

  it("never deletes rows this workspace doesn't know (second computer, fresh or unloaded workspace)", () => {
    expect(staleShareIds([row("s1"), row("s2")], ws({}), scope)).toEqual([]);
  });

  it("never deletes a crewmate's rows, or rows in another crew", () => {
    const local = ws({ "/a.flp": { shared: false, shareId: "s1" } });
    expect(staleShareIds([row("s1", { owner_id: "someone-else" })], local, scope)).toEqual([]);
    expect(staleShareIds([row("s1", { crew_id: "crew-b" })], local, scope)).toEqual([]);
  });

  it("leaves another account's unshare on this machine alone", () => {
    const local = ws({ "/a.flp": { shared: false, shareId: "s1", shareCrewId: CREW, shareUserId: "other-account" } });
    expect(staleShareIds([row("s1")], local, scope)).toEqual([]);
  });
});

describe("share scope", () => {
  it("a share belongs to one crew and one account (legacy unscoped shares count)", () => {
    expect(sharedHere({ shared: true, shareId: "s", shareCrewId: CREW, shareUserId: ME }, scope)).toBe(true);
    expect(sharedHere({ shared: true, shareId: "s" }, scope)).toBe(true);
    expect(sharedHere({ shared: true, shareId: "s", shareCrewId: "crew-b" }, scope)).toBe(false);
    expect(sharedHere({ shared: true, shareId: "s", shareUserId: "other" }, scope)).toBe(false);
  });

  it("switching crews never pushes another crew's shares", () => {
    const local = ws({ "/a.flp": { shared: true, shareId: "s1", shareCrewId: "crew-b", shareUserId: ME } });
    expect(sharedPayloads([project("/a.flp")], local, scope)).toEqual([]);
  });
});

describe("stage moves", () => {
  it("the regular payload never carries a stage timestamp", () => {
    const local = ws({ "/a.flp": { shared: true, shareId: "s1", status: "prep" } });
    const [p] = sharedPayloads([project("/a.flp")], local, scope);
    expect(p).not.toHaveProperty("stage_updated_at");
  });

  it("a crewmate's newer move is applied locally", () => {
    const local = ws({ "/a.flp": { shared: true, shareId: "s1", status: "production", stageUpdatedAtMs: Date.parse("2026-10-01T00:00:00Z") } });
    const moves = remoteStageMoves([row("s1", { stage: "prep", stage_updated_at: "2026-10-12T00:00:00Z" })], local, ME);
    expect(moves).toEqual([{ path: "/a.flp", stage: "prep", atMs: Date.parse("2026-10-12T00:00:00Z") }]);
  });

  it("an older local stage doesn't rewind a crewmate's move", () => {
    const local = ws({ "/a.flp": { shared: true, shareId: "s1", status: "production", stageUpdatedAtMs: Date.parse("2026-10-01T00:00:00Z") } });
    expect(localStageMoves([row("s1", { stage: "prep", stage_updated_at: "2026-10-12T00:00:00Z" })], local, scope)).toEqual([]);
  });

  it("my newer local move is sent", () => {
    const local = ws({ "/a.flp": { shared: true, shareId: "s1", status: "release", stageUpdatedAtMs: Date.parse("2026-10-13T00:00:00Z") } });
    expect(localStageMoves([row("s1", { stage: "prep" })], local, scope)).toEqual([{ id: "s1", stage: "release" }]);
  });
});

describe("payload always passes the database checks", () => {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  // Same estimates as pg_column_size, rounded up: text[] and jsonb.
  const tagsSize = (tags: string[]) => 24 + tags.reduce((n, t) => n + 4 + Math.ceil(bytes(t) / 4) * 4, 0);
  const creditsSize = (c: { name: string; role: string }[]) => 16 + c.reduce((n, x) => n + 64 + bytes(x.name) + bytes(x.role), 0);

  it("a whitespace-only or empty title falls back to a real one", () => {
    expect(sharedTitle("   ")).toBe("Untitled");
    expect(sharedTitle("")).toBe("Untitled");
    expect(sharedTitle("  My Song  ")).toBe("My Song");
  });

  it("a long title is cut to 200 characters without splitting an emoji", () => {
    const t = sharedTitle("🔥".repeat(300));
    expect(Array.from(t)).toHaveLength(200);
    expect(t).toBe("🔥".repeat(200));
  });

  it("multi-byte tags stay under the 2048-byte column cap", () => {
    const tags = sharedTags(Array.from({ length: 30 }, () => "音".repeat(40)));
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThan(30);
    expect(tagsSize(tags)).toBeLessThanOrEqual(2048);
  });

  it("drops blank tags and caps count and length", () => {
    const tags = sharedTags(["  ", "trap", "x".repeat(100), ...Array.from({ length: 40 }, (_, i) => `t${i}`)]);
    expect(tags[0]).toBe("trap");
    expect(tags[1]).toHaveLength(40);
    expect(tags).toHaveLength(30);
  });

  it("long roles are capped and credits stay under the 8192-byte column cap", () => {
    const credits = sharedCredits(Array.from({ length: 30 }, () => ({ name: "名".repeat(80), role: "役".repeat(500), split: 3 })));
    expect(credits.every((c) => Array.from(c.role).length <= 40 && Array.from(c.name).length <= 60)).toBe(true);
    expect(credits.length).toBeLessThanOrEqual(30);
    expect(creditsSize(credits)).toBeLessThanOrEqual(8192);
  });

  it("a split outside 0-100 is sent as null (the database refuses it)", () => {
    expect(sharedCredits([{ name: "A", role: "", split: 150 }, { name: "B", role: "", split: -5 }, { name: "C", role: "", split: 100 }]).map((c) => c.split)).toEqual([
      null,
      null,
      100,
    ]);
  });

  it("a non-finite split is sent as null", () => {
    expect(sharedCredits([{ name: "Producer", role: "beat", split: Number.NaN }])).toEqual([{ name: "Producer", role: "beat", split: null }]);
  });

  it("an impossible release date is left out", () => {
    const local = ws({ "/a.flp": { shared: true, shareId: "s1", launchKit: { edits: { releaseDate: "2026-02-30" } } } as Workspace["songs"][string] });
    expect(sharedPayloads([project("/a.flp")], local, scope)[0].release_date).toBeNull();
  });
});

describe("shareElsewhere (re-sharing in another crew)", () => {
  it("nothing to move for a song shared here, legacy-unscoped, or never shared", () => {
    expect(shareElsewhere({ shared: true, shareId: "s", shareCrewId: CREW, shareUserId: ME }, scope)).toBeNull();
    expect(shareElsewhere({ shared: true, shareId: "s" }, scope)).toBeNull();
    expect(shareElsewhere({}, scope)).toBeNull();
  });

  it("flags a song shared, or waiting to be unshared, in another crew", () => {
    expect(shareElsewhere({ shared: true, shareId: "s", shareCrewId: "crew-b", shareUserId: ME }, scope)).toEqual({ crewId: "crew-b", mine: true, shared: true });
    expect(shareElsewhere({ shared: false, shareId: "s", shareCrewId: "crew-b", shareUserId: ME }, scope)).toEqual({ crewId: "crew-b", mine: true, shared: false });
  });

  it("knows when the share belongs to another account on this machine", () => {
    expect(shareElsewhere({ shared: true, shareId: "s", shareCrewId: CREW, shareUserId: "other" }, scope)?.mine).toBe(false);
  });
});

describe("orphanedShares", () => {
  it("flags shared songs missing from the library", () => {
    const local = ws({ "/gone.flp": { shared: true, shareId: "s1" }, "/here.flp": { shared: true, shareId: "s2" } });
    expect(orphanedShares([project("/here.flp")], local, scope)).toEqual(["/gone.flp"]);
  });
});

describe("what a shared song sends (allow-list)", () => {
  const p = {
    path: "/Users/someone/Music/Night Run v3.flp",
    name: "Night Run v3",
    tempoBpm: 140,
    renders: ["/Users/someone/Music/Night Run.wav"],
    trackNames: ["Kick - SomePack_Vol3"],
    samples: ["/Users/someone/Samples/kick.wav"],
    modifiedAtMs: Date.UTC(2026, 9, 1),
  } as unknown as ProjectInfo;
  const meta = { shared: true, shareId: "s1", notes: "private lyric", tags: ["dark"], key: "Am" };

  it("sends exactly the listed fields, never notes, paths, samples or track names", () => {
    const [payload] = sharedPayloads([p], ws({ [p.path]: meta }), scope);
    expect(Object.keys(payload).sort()).toEqual(
      ["bpm", "credits", "crew_id", "has_mixdown", "id", "kit_accepted", "last_saved_at", "musical_key", "release_date", "stage", "tags", "title"].sort(),
    );
    const all = JSON.stringify(payload);
    for (const leak of ["private lyric", "/Users/", "SomePack", "kick.wav"]) expect(all).not.toContain(leak);
    expect(payload.title).toBe("Night Run");
    expect(payload.has_mixdown).toBe(true);
  });

  it("uses the title typed for the crew instead of the file name", () => {
    const [payload] = sharedPayloads([p], ws({ [p.path]: { ...meta, shareTitle: "  Midnight Run  " } }), scope);
    expect(payload.title).toBe("Midnight Run");
    expect(sharedTitle("Night Run v3", "   ")).toBe("Night Run");
  });
});
