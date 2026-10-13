import { describe, expect, it } from "vitest";
import type { ProjectInfo, Workspace } from "../types";
import { attentionItems } from "./attention";

const NOW = Date.UTC(2026, 9, 13);
const song = (name: string, over: Partial<ProjectInfo> = {}) =>
  ({
    path: `/p/${name}.flp`,
    name,
    modifiedAtMs: NOW - 3600e3,
    renders: [],
    plugins: [],
    samples: [],
    ...over,
  }) as unknown as ProjectInfo;
const ws = (songs: Workspace["songs"]): Workspace => ({ version: 2, songs, albums: [], people: [] });
const render = (ago: number) => [{ path: "/p/x.wav", sizeBytes: 1, modifiedAtMs: NOW - ago }];

describe("needs attention", () => {
  it("is empty when nothing needs fixing", () => {
    expect(attentionItems([song("Fine", { renders: render(0) })], ws({}))).toEqual([]);
    expect(attentionItems([], ws({}))).toEqual([]);
  });

  it("gives every reason, most urgent first", () => {
    const s = song("Busy", {
      renders: render(7200e3),
      samples: [{ path: "/a.wav", status: "missing" }, { path: "/b.wav", status: "missing" }] as ProjectInfo["samples"],
      plugins: [{ name: "Serum", vendor: null, installed: false }] as ProjectInfo["plugins"],
    });
    const [item] = attentionItems([s], ws({}));
    expect(item.reasons.map((r) => r.text)).toEqual(["Mixdown is older than the project", "2 samples missing", "1 plugin not installed here"]);
    expect(item.lastActivityMs).toBe(NOW - 3600e3);
  });

  it("puts finished songs without a mixdown first, then the most recently worked on", () => {
    const items = attentionItems(
      [
        song("Old stale", { modifiedAtMs: NOW - 9e8, renders: render(9.5e8) }),
        song("New stale", { renders: render(7200e3) }),
        song("Done, no mix"),
        song("In progress, no mix"),
      ],
      ws({ "/p/Done, no mix.flp": { status: "prep" }, "/p/In progress, no mix.flp": { status: "creation" } }),
    );
    expect(items.map((i) => i.song.name)).toEqual(["Done, no mix", "New stale", "Old stale"]);
  });

  it("handles a big library", () => {
    const many = Array.from({ length: 25 }, (_, i) => song(`Song ${i}`, { renders: render(7200e3) }));
    expect(attentionItems(many, ws({}))).toHaveLength(25);
  });
});
