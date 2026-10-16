import { describe, expect, it } from "vitest";
import type { BeatFile } from "../types";
import { MAX_PICKS, filterBeats, useDigger } from "./useDigger";

const beat = (name: string, folder = "/beats"): BeatFile => ({ path: `${folder}/${name}.mp3`, name, folder, sizeBytes: 1, modifiedAtMs: 1 });

describe("digger", () => {
  it("search matches every word in the name or folder", () => {
    const beats = [beat("Dark Trap Beat (prod. Kay)"), beat("Chill Lofi", "/beats/youtube"), beat("Night Drive Trap")];
    expect(filterBeats(beats, "trap").map((b) => b.name)).toEqual(["Dark Trap Beat (prod. Kay)", "Night Drive Trap"]);
    expect(filterBeats(beats, "trap night").map((b) => b.name)).toEqual(["Night Drive Trap"]);
    expect(filterBeats(beats, "youtube").map((b) => b.name)).toEqual(["Chill Lofi"]);
    expect(filterBeats(beats, "  ")).toHaveLength(3);
  });

  it(`picks at most ${MAX_PICKS} beats, in pick order; picking again unpicks`, () => {
    const s = useDigger.getState();
    s.clearPicks();
    for (let i = 1; i <= 7; i++) useDigger.getState().toggle(`/b/${i}.mp3`);
    expect(useDigger.getState().picked).toEqual(["/b/1.mp3", "/b/2.mp3", "/b/3.mp3", "/b/4.mp3", "/b/5.mp3"]);
    useDigger.getState().toggle("/b/2.mp3");
    useDigger.getState().toggle("/b/6.mp3");
    expect(useDigger.getState().picked).toEqual(["/b/1.mp3", "/b/3.mp3", "/b/4.mp3", "/b/5.mp3", "/b/6.mp3"]);
    useDigger.getState().clearPicks();
  });
});
