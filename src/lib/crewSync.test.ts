import { describe, expect, it } from "vitest";
import type { CrewSongRow, ProjectInfo, Workspace } from "../types";
import { localStageMoves, orphanedShares, remoteStageMoves, sharedHere, sharedPayloads, staleShareIds } from "./crewSync";

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

describe("orphanedShares", () => {
  it("flags shared songs missing from the library", () => {
    const local = ws({ "/gone.flp": { shared: true, shareId: "s1" }, "/here.flp": { shared: true, shareId: "s2" } });
    expect(orphanedShares([project("/here.flp")], local, scope)).toEqual(["/gone.flp"]);
  });
});
