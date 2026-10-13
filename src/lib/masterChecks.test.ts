import { describe, expect, it } from "vitest";
import type { MasterSpec } from "../types";
import { masterChecks } from "./launchKit";

const good: MasterSpec = { container: "wav", sampleRate: 44100, channels: 2, bitsPerSample: 24, peak: 0.89, clippedSamples: 0 };
const msgs = (m: Partial<MasterSpec>) => masterChecks({ ...good, ...m }).map((c) => c.message);

describe("masterChecks (what distributors accept)", () => {
  it("passes a 44.1 kHz 24-bit stereo WAV with headroom", () => {
    expect(masterChecks(good)).toEqual([]);
    expect(msgs({ bitsPerSample: 16 })).toEqual([]);
  });

  it("flags lossy masters and points at FL's export settings", () => {
    const [m] = msgs({ container: "mp3", bitsPerSample: null });
    expect(m).toMatch(/MP3: distributors want lossless WAV/);
    expect(m).toMatch(/44,100 Hz, 24-bit/);
  });

  it("flags 48 kHz, odd bit depths and mono", () => {
    expect(msgs({ sampleRate: 48000 })[0]).toMatch(/48 kHz/);
    expect(msgs({ sampleRate: 96000 })[0]).toMatch(/96\.0 kHz/);
    expect(msgs({ bitsPerSample: 32 })[0]).toMatch(/32-bit/);
    expect(msgs({ channels: 1 })[0]).toMatch(/Mono/);
  });

  it("flags clipping, but not a stray full-scale sample", () => {
    expect(msgs({ clippedSamples: 2 })).toEqual([]);
    expect(msgs({ clippedSamples: 1200 })[0]).toMatch(/1,200 times: likely clipping/);
  });
});
