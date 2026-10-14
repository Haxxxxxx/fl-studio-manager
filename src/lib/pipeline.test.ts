import { describe, expect, it } from "vitest";
import type { ProjectInfo, Workspace } from "../types";
import {
  addColumn,
  canRemoveColumn,
  columnOf,
  defaultPipeline,
  filterSongs,
  flatRows,
  groupSongs,
  moveCard,
  moveColumn,
  removeColumn,
  renameColumn,
  resolvePipeline,
  sortRows,
} from "./pipeline";

const NOW = Date.UTC(2026, 9, 14);
const song = (name: string, daysAgo = 1, bpm: number | null = null) =>
  ({ path: `/p/${name}.flp`, name, modifiedAtMs: NOW - daysAgo * 864e5, backups: [], tempoBpm: bpm }) as unknown as ProjectInfo;
const ws = (songs: Workspace["songs"] = {}, pipeline?: Workspace["pipeline"]): Workspace => ({ version: 2, songs, albums: [], people: [], pipeline });
const names = (w: Workspace, list: ProjectInfo[]) => groupSongs(list, w).map((g) => [g.column.name, g.songs.map((s) => s.name)]);

const A = song("A", 1);
const B = song("B", 2);
const C = song("C", 3);
const all = [A, B, C];

describe("pipeline model", () => {
  it("defaults to one column per stage, songs most recently saved first", () => {
    const w = ws({ "/p/A.flp": { status: "creation" }, "/p/B.flp": { status: "creation" } });
    expect(names(w, all)).toEqual([
      ["Unsorted", ["C"]],
      ["Creation", ["A", "B"]],
      ["Production", []],
      ["Prep", []],
      ["Release", []],
      ["Promotion", []],
    ]);
  });

  it("repairs a broken config: every stage keeps a column, bad entries dropped", () => {
    const cfg = resolvePipeline(
      ws({}, {
        columns: [
          { id: "x", name: "  Mixing   room ", stage: "production" },
          { id: "x", name: "dup", stage: "prep" },
          { id: "y", name: "Bad", stage: "nope" as never },
        ],
        order: { x: ["/p/A.flp", 3 as never], gone: ["/p/B.flp"] },
      }),
    );
    expect(cfg.columns.map((c) => [c.name, c.stage])).toEqual([
      ["Unsorted", null],
      ["Creation", "creation"],
      ["Mixing room", "production"],
      ["Prep", "prep"],
      ["Release", "release"],
      ["Promotion", "promotion"],
    ]);
    expect(cfg.order).toEqual({ x: ["/p/A.flp"] });
  });

  it("a rename shows in every view (one model)", () => {
    const w = renameColumn(ws({ "/p/A.flp": { status: "production" } }), "production", "Studio");
    const groups = groupSongs(all, w);
    expect(groups[2].column.name).toBe("Studio");
    expect(flatRows(groups).find((r) => r.song.name === "A")!.column.name).toBe("Studio");
    expect(renameColumn(w, "production", "   ")).toBe(w);
  });

  it("adds a column after its stage's last column; moving a card into it sets that stage", () => {
    let w = addColumn(ws(), "Mixing", "production", "mix");
    expect(resolvePipeline(w).columns.map((c) => c.id)).toEqual(["unsorted", "creation", "production", "mix", "prep", "release", "promotion"]);
    w = moveCard(w, all, "/p/A.flp", "mix", null, NOW);
    expect(w.songs["/p/A.flp"]).toMatchObject({ status: "production", column: "mix", stagePending: true, stageUpdatedAtMs: NOW });
    expect(columnOf(w.songs["/p/A.flp"], resolvePipeline(w)).name).toBe("Mixing");
  });

  it("reordering within a stage never marks a stage change for the crew", () => {
    let w = addColumn(ws({ "/p/A.flp": { status: "production", stageBaseAt: "v1" } }), "Mixing", "production", "mix");
    w = moveCard(w, all, "/p/A.flp", "mix", null, NOW);
    expect(w.songs["/p/A.flp"]).toEqual({ status: "production", stageBaseAt: "v1", column: "mix" });
  });

  it("hand-sorted card order is kept per column", () => {
    let w = ws({ "/p/A.flp": { status: "creation" }, "/p/B.flp": { status: "creation" }, "/p/C.flp": { status: "creation" } });
    expect(names(w, all)[1]).toEqual(["Creation", ["A", "B", "C"]]);
    w = moveCard(w, all, "/p/C.flp", "creation", "/p/A.flp");
    expect(names(w, all)[1]).toEqual(["Creation", ["C", "A", "B"]]);
    w = moveCard(w, all, "/p/C.flp", "creation", null);
    expect(names(w, all)[1]).toEqual(["Creation", ["A", "B", "C"]]);
    // A new song (not hand-sorted yet) goes after the sorted ones.
    const D = song("D", 0);
    w = { ...w, songs: { ...w.songs, "/p/D.flp": { status: "creation" } } };
    expect(names(w, [...all, D])[1]).toEqual(["Creation", ["A", "B", "C", "D"]]);
  });

  it("a stage changed elsewhere (drawer, crewmate) moves the song to that stage's first column", () => {
    let w = addColumn(ws(), "Mixing", "production", "mix");
    w = moveCard(w, all, "/p/A.flp", "mix", null, NOW);
    w = { ...w, songs: { ...w.songs, "/p/A.flp": { ...w.songs["/p/A.flp"], status: "prep" } } };
    expect(columnOf(w.songs["/p/A.flp"], resolvePipeline(w)).id).toBe("prep");
  });

  it("removing a column: songs keep their stage and move to the stage's other column; the last column of a stage stays", () => {
    let w = addColumn(ws(), "Mixing", "production", "mix");
    w = moveCard(w, all, "/p/A.flp", "mix", null, NOW);
    const cfg = resolvePipeline(w);
    expect(canRemoveColumn(cfg, "mix")).toBe(true);
    expect(canRemoveColumn(cfg, "creation")).toBe(false);
    expect(removeColumn(w, "creation")).toBe(w);
    const after = removeColumn(w, "mix");
    expect(after.songs["/p/A.flp"]).toMatchObject({ status: "production", column: "production" });
    expect(names(after, all)[2]).toEqual(["Production", ["A"]]);
    expect(resolvePipeline(after).order.mix).toBeUndefined();
  });

  it("hand-sorted lists only keep songs still in that column", () => {
    let w = ws({ "/p/A.flp": { status: "creation" }, "/p/B.flp": { status: "creation" } });
    w = moveCard(w, all, "/p/B.flp", "creation", "/p/A.flp");
    expect(resolvePipeline(w).order.creation).toEqual(["/p/B.flp", "/p/A.flp"]);
    // B moves to Prep elsewhere (drawer, crewmate); the next board edit drops it from Creation's list.
    w = { ...w, songs: { ...w.songs, "/p/B.flp": { status: "prep" } } };
    w = moveCard(w, all, "/p/C.flp", "prep", null);
    expect(resolvePipeline(w).order.creation).toEqual(["/p/A.flp"]);
    // A song no longer on the board (archived, deleted) is dropped too.
    w = moveCard(w, [B, C], "/p/C.flp", "prep", "/p/B.flp");
    expect(resolvePipeline(w).order.creation).toBeUndefined();
  });

  it("columns can be reordered", () => {
    const w = moveColumn(ws(), "promotion", 0);
    expect(resolvePipeline(w).columns[0].id).toBe("promotion");
    expect(moveColumn(w, "nope", 1)).toBe(w);
  });

  it("one filter and one sort for every view; a view's sort never touches the board", () => {
    const w = ws({ "/p/A.flp": { status: "creation", tags: ["dark"] }, "/p/B.flp": { status: "prep", key: "Am" } });
    expect(filterSongs(all, w, "#dark").map((s) => s.name)).toEqual(["A"]);
    expect(filterSongs(all, w, "am").map((s) => s.name)).toEqual(["B"]);
    const rows = flatRows(groupSongs(all, w));
    expect(rows.map((r) => r.song.name)).toEqual(["C", "A", "B"]);
    expect(sortRows(rows, "name", -1, w).map((r) => r.song.name)).toEqual(["C", "B", "A"]);
    expect(sortRows(rows, "saved", -1, w).map((r) => r.song.name)).toEqual(["A", "B", "C"]);
    expect(groupSongs(all, w).map((g) => g.songs.map((s) => s.name)).flat()).toEqual(["C", "A", "B"]);
  });

  it("default ids match the stages, so an untouched workspace needs no stored config", () => {
    expect(defaultPipeline().columns.map((c) => c.id)).toEqual(["unsorted", "creation", "production", "prep", "release", "promotion"]);
  });
});
