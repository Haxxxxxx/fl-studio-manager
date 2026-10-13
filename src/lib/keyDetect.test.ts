import { describe, expect, it } from "vitest";
import type { AudioAnalysis, ProjectInfo, SongMeta } from "../types";
import { buildKit, relativeKeys } from "./launchKit";

const project = { path: "/p/a.flp", name: "Song", tempoBpm: 140, genre: null, artist: null, trackNames: [], renders: [] } as unknown as ProjectInfo;
const analysis = (key: string, confidence: number) => ({ durationSec: 120, windowSec: 0.5, energy: [], snippets: [], key: { key, confidence } }) as AudioAnalysis;
const keyField = (meta: SongMeta, a: AudioAnalysis | null) =>
  buildKit({ project, meta, people: [], albums: [], analysis: a, today: new Date(2026, 9, 13) }).find((f) => f.id === "key")!;

describe("key from the audio", () => {
  it("a confident estimate is detected", () => {
    const f = keyField({}, analysis("Am", 0.8));
    expect([f.value, f.source]).toEqual(["Am", "detected"]);
    expect(f.note).toMatch(/80% sure/);
  });

  it("a weak estimate is only a suggestion to check by ear", () => {
    const f = keyField({}, analysis("F#m", 0.3));
    expect([f.value, f.source]).toEqual(["F#m", "suggested"]);
    expect(f.note).toMatch(/Check it by ear/);
  });

  it("a typed key wins, with a note when the audio clearly disagrees", () => {
    expect(keyField({ key: "Dm" }, analysis("F#m", 0.9)).note).toMatch(/sounds more like F#m/);
    expect(keyField({ key: "Dm" }, analysis("F#m", 0.9)).value).toBe("Dm");
  });

  it("doesn't nag about relative keys (C and Am share every note)", () => {
    expect(keyField({ key: "C" }, analysis("Am", 0.9)).note).toBe("Set in the song panel");
    expect(relativeKeys("C", "Am")).toBe(true);
    expect(relativeKeys("Eb", "Cm")).toBe(true);
    expect(relativeKeys("C", "Em")).toBe(false);
    expect(relativeKeys("C", "G")).toBe(false);
  });

  it("no analysis, no key: still asks", () => {
    expect(keyField({}, null).source).toBe("missing");
  });
});
