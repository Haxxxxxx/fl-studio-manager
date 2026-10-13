import { describe, expect, it } from "vitest";
import type { ProjectInfo } from "../types";
import { buildKit, kitChecks } from "./launchKit";
import { canRenderInApp, dawOf } from "./daws";

const project = (over: Partial<ProjectInfo>) =>
  ({ path: "/p/Song.x", name: "Song", tempoBpm: null, genre: null, artist: null, trackNames: [], renders: [{ path: "/p/Song.wav", sizeBytes: 1, modifiedAtMs: 2 }], modifiedAtMs: 1, ...over }) as unknown as ProjectInfo;

describe("DAWs", () => {
  it("treats pre-multi-DAW projects as FL Studio", () => {
    expect(dawOf({}).label).toBe("FL Studio");
    expect(canRenderInApp({})).toBe(true);
  });

  it("only FL Studio projects render or package from the app", () => {
    expect(canRenderInApp({ daw: "ableton" })).toBe(false);
    expect(canRenderInApp({ daw: "pro-tools" })).toBe(false);
    expect(canRenderInApp({ daw: "fl-studio" })).toBe(true);
  });

  it("Launch Kit notes name the project's DAW", () => {
    const tempo = buildKit({ project: project({ daw: "ableton", tempoBpm: 128 }), meta: {}, people: [], albums: [], analysis: null }).find((f) => f.id === "bpm")!;
    expect(tempo.note).toBe("From the Ableton Live project's tempo");
  });

  it("closed formats ask for the tempo once, saying why", () => {
    const tempo = buildKit({ project: project({ daw: "pro-tools" }), meta: {}, people: [], albums: [], analysis: null }).find((f) => f.id === "bpm")!;
    expect(tempo.source).toBe("missing");
    expect(tempo.note).toMatch(/Pro Tools projects can't be read from outside/);
  });

  it("master export tips point at the right DAW", () => {
    const master = { container: "mp3", sampleRate: 44100, channels: 2, bitsPerSample: null, peak: 0.8, clippedSamples: 0 };
    const [check] = kitChecks(project({ daw: "reaper" }), { durationSec: 1, windowSec: 1, energy: [], snippets: [], master });
    expect(check.message).toMatch(/In REAPER: File → Render/);
  });
});
