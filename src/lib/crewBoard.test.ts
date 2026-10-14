import { describe, expect, it } from "vitest";
import type { CrewColumnRow, CrewSongRow } from "../types";
import { columnsPayload, crewColumnOf, crewEdits, crewMove, crewPipeline, groupCrewSongs, orderFor } from "./crewBoard";

const T = (min: number) => new Date(Date.UTC(2026, 9, 14, 12, min)).toISOString();
const song = (id: string, stage: CrewSongRow["stage"], extra: Partial<CrewSongRow> = {}) =>
  ({ id, title: id, stage, stage_updated_at: T(0), column_id: null, board_order: null, ...extra }) as CrewSongRow;
const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const col = (n: number, name: string, stage: CrewColumnRow["stage"], position: number): CrewColumnRow => ({ id: U(n), crew_id: "c", name, stage, position });
const SERVER: CrewColumnRow[] = [
  col(1, "Ideas", null, 0),
  col(2, "Writing", "creation", 1),
  col(3, "Studio", "production", 2),
  col(4, "Mixing", "production", 3),
  col(5, "Prep", "prep", 4),
  col(6, "Out", "release", 5),
  col(7, "Promo", "promotion", 6),
];

describe("crew board", () => {
  it("a crew without saved columns gets one per stage, moves are stage moves", () => {
    const { cfg, onServer } = crewPipeline([]);
    expect(onServer).toBe(false);
    expect(cfg.columns.map((c) => c.id)).toEqual(["unsorted", "creation", "production", "prep", "release", "promotion"]);
    const songs = [song("a", "creation")];
    expect(crewMove(songs, cfg, false, "a", "prep", null)).toEqual({ kind: "stage", songId: "a", stage: "prep", expectedAt: T(0) });
    expect(crewMove(songs, cfg, false, "a", "creation", null)).toEqual({ kind: "none" });
  });

  it("server columns in position order; a song sits in its column if it matches its stage", () => {
    const { cfg, onServer } = crewPipeline([...SERVER].reverse());
    expect(onServer).toBe(true);
    expect(cfg.columns.map((c) => c.name)).toEqual(["Ideas", "Writing", "Studio", "Mixing", "Prep", "Out", "Promo"]);
    expect(crewColumnOf(song("a", "production", { column_id: U(4) }), cfg).name).toBe("Mixing");
    // Stage changed since (column cleared or stale): the stage's first column.
    expect(crewColumnOf(song("a", "prep", { column_id: U(4) }), cfg).name).toBe("Prep");
    expect(crewColumnOf(song("a", "production"), cfg).name).toBe("Studio");
  });

  it("hand-placed cards first in their order, then the rest, latest move first", () => {
    const { cfg } = crewPipeline(SERVER);
    const songs = [
      song("x", "production", { stage_updated_at: T(1) }),
      song("y", "production", { stage_updated_at: T(5) }),
      song("p2", "production", { board_order: 2 }),
      song("p1", "production", { board_order: 1 }),
    ];
    expect(groupCrewSongs(songs, cfg)[2].songs.map((s) => s.id)).toEqual(["p1", "p2", "y", "x"]);
  });

  it("drop order lands between the neighbours", () => {
    const col = [song("a", "creation", { board_order: 1 }), song("b", "creation", { board_order: 2 }), song("c", "creation")];
    expect(orderFor(col, "z", "b")).toBe(1.5);
    expect(orderFor(col, "z", "a")).toBe(0);
    expect(orderFor(col, "z", null)).toBe(3);
    // Before a card nobody placed: after the placed ones.
    expect(orderFor(col, "z", "c")).toBe(3);
    expect(orderFor([], "z", null)).toBe(1);
  });

  it("with server columns, a move is a card move (column + order + version)", () => {
    const { cfg } = crewPipeline(SERVER);
    const songs = [song("a", "creation", { stage_updated_at: T(3) }), song("b", "production", { board_order: 5, column_id: U(4) })];
    expect(crewMove(songs, cfg, true, "a", U(4), "b")).toEqual({ kind: "card", songId: "a", columnId: U(4), order: 4, expectedAt: T(3), renumber: [] });
    expect(crewMove(songs, cfg, true, "nope", U(4), null)).toEqual({ kind: "none" });
  });

  it("owner edits follow your pipeline's rules; defaults get real ids when first saved", () => {
    const { cfg } = crewPipeline([]);
    let next = crewEdits.rename(cfg, "production", "Studio");
    next = crewEdits.add(next, "Mixing", "production", U(9));
    expect(next.columns.map((c) => c.name)).toEqual(["Unsorted", "Creation", "Studio", "Mixing", "Prep", "Release", "Promotion"]);
    expect(crewEdits.canRemove(next, "creation")).toBe(false);
    expect(crewEdits.remove(next, U(9)).columns.length).toBe(6);
    let n = 0;
    const payload = columnsPayload(next, () => `new-${n++}`);
    expect(payload.find((c) => c.name === "Mixing")!.id).toBe(U(9));
    expect(payload.find((c) => c.name === "Studio")!.id).toMatch(/^new-/);
    expect(payload.map((c) => c.stage)).toEqual([null, "creation", "production", "production", "prep", "release", "promotion"]);
  });

  it("dropping a card on itself does nothing", () => {
    const { cfg } = crewPipeline(SERVER);
    const songs = [song("a", "production", { column_id: U(4), board_order: 1 }), song("b", "production", { column_id: U(4), board_order: 2 })];
    expect(crewMove(songs, cfg, true, "a", U(4), "a")).toEqual({ kind: "none" });
  });

  it("among cards nobody placed, the whole column is placed as shown", () => {
    const { cfg } = crewPipeline(SERVER);
    // Fresh crew: nothing placed; shown latest move first: c, b, a.
    const songs = [
      song("a", "creation", { stage_updated_at: T(1) }),
      song("b", "creation", { stage_updated_at: T(2) }),
      song("c", "creation", { stage_updated_at: T(3) }),
      song("z", "prep", { stage_updated_at: T(9) }),
    ];
    const m = crewMove(songs, cfg, true, "z", U(2), "a");
    expect(m).toMatchObject({ kind: "card", order: 3, renumber: [{ songId: "c", order: 1 }, { songId: "b", order: 2 }, { songId: "a", order: 4 }] });
    // Applying it gives exactly c, b, z, a.
    const after = songs.map((s) => {
      if (s.id === "z") return { ...s, stage: "creation" as const, column_id: U(2), board_order: 3 };
      const r = m.kind === "card" ? m.renumber.find((x) => x.songId === s.id) : undefined;
      return r ? { ...s, column_id: U(2), board_order: r.order } : s;
    });
    expect(groupCrewSongs(after, cfg)[1].songs.map((s) => s.id)).toEqual(["c", "b", "z", "a"]);
  });
});
