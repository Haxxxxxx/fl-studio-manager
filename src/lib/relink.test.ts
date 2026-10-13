import { describe, expect, it } from "vitest";
import type { ProjectInfo, Workspace } from "../types";
import { applyRelinks, findRelinks } from "./relink";

const W = ["/music/Projects"];
const proj = (path: string, isTemplate = false) => ({ path, isTemplate }) as ProjectInfo;
const ws = (songs: Workspace["songs"], albums: Workspace["albums"] = []): Workspace => ({ version: 2, songs, albums, people: [] });

describe("findRelinks", () => {
  it("keeps a moved song's record (same file name, new folder)", () => {
    const r = findRelinks([proj("/music/Projects/2026/Night Run/Night Run.flp")], ws({ "/music/Projects/Night Run/Night Run.flp": { status: "prep" } }), W);
    expect(r).toEqual([{ from: "/music/Projects/Night Run/Night Run.flp", to: "/music/Projects/2026/Night Run/Night Run.flp", reason: "moved" }]);
  });

  it("keeps a renamed song's record (only newcomer in the folder)", () => {
    const r = findRelinks([proj("/music/Projects/Night Run/Night Run FINAL.flp")], ws({ "/music/Projects/Night Run/Night Run.flp": { tags: ["dark"] } }), W);
    expect(r).toEqual([{ from: "/music/Projects/Night Run/Night Run.flp", to: "/music/Projects/Night Run/Night Run FINAL.flp", reason: "renamed" }]);
  });

  it("never relinks a song that's still there", () => {
    const p = "/music/Projects/A/A.flp";
    expect(findRelinks([proj(p), proj("/music/Projects/A/A 2.flp")], ws({ [p]: { status: "creation" } }), W)).toEqual([]);
  });

  it("leaves two newcomers in one folder alone", () => {
    const r = findRelinks([proj("/music/Projects/A/A v2.flp"), proj("/music/Projects/A/A v3.flp")], ws({ "/music/Projects/A/A.flp": { status: "creation" } }), W);
    expect(r).toEqual([]);
  });

  it("leaves a file name that turns up twice alone", () => {
    const r = findRelinks([proj("/music/Projects/x/Hook.flp"), proj("/music/Projects/y/Hook.flp")], ws({ "/music/Projects/old/Hook.flp": { status: "creation" } }), W);
    expect(r).toEqual([]);
  });

  it("doesn't treat an unlinked folder or unplugged drive as a move", () => {
    expect(findRelinks([proj("/music/Projects/Night Run.flp")], ws({ "/Volumes/USB/Night Run.flp": { status: "prep" } }), W)).toEqual([]);
  });

  it("never moves a record onto a file that has its own", () => {
    const r = findRelinks(
      [proj("/music/Projects/B/Song.flp")],
      ws({ "/music/Projects/A/Song.flp": { status: "prep" }, "/music/Projects/B/Song.flp": { status: "creation" } }),
      W,
    );
    expect(r).toEqual([]);
  });

  it("matches Windows paths and case differences", () => {
    const r = findRelinks([proj("C:\\Music\\Projects\\New\\Night Run.flp")], ws({ "C:\\Music\\Projects\\Night Run.flp": { status: "prep" } }), ["C:\\Music\\Projects"]);
    expect(r).toHaveLength(1);
  });

  it("never targets templates", () => {
    expect(findRelinks([proj("/music/Projects/A/T.flp", true)], ws({ "/music/Projects/A/A.flp": { status: "creation" } }), W)).toEqual([]);
  });
});

describe("applyRelinks", () => {
  it("moves the record (crew share included) and the album slot, keeping the order", () => {
    const album = { id: "al", title: "", kind: "ep" as const, color: "", releaseDate: null, notes: "", trackPaths: ["/a/Other.flp", "/a/Old.flp"], createdAtMs: 0 };
    const out = applyRelinks(ws({ "/a/Old.flp": { status: "prep", shared: true, shareId: "s1" }, "/a/Other.flp": {} }, [album]), [
      { from: "/a/Old.flp", to: "/b/Old.flp", reason: "moved" },
    ]);
    expect(out.songs["/b/Old.flp"]).toEqual({ status: "prep", shared: true, shareId: "s1" });
    expect(out.songs["/a/Old.flp"]).toBeUndefined();
    expect(out.albums[0].trackPaths).toEqual(["/a/Other.flp", "/b/Old.flp"]);
  });
});
