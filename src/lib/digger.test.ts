import { describe, expect, it } from "vitest";
import { MAX_QUERY_CHARS, beatFactsLine, beatQuery, googleSearchUrl, youtubeSearchUrl } from "./digger";

describe("digger links", () => {
  it("builds a YouTube search page link", () => {
    expect(youtubeSearchUrl("  dark  trap & rain ")).toBe("https://www.youtube.com/results?search_query=dark%20trap%20%26%20rain");
  });

  it("builds Google links and a facts line", () => {
    expect(googleSearchUrl("dark trap  beat")).toBe("https://www.google.com/search?q=dark%20trap%20beat");
    expect(beatFactsLine({ bpm: 140, bpmSource: "name", key: "Am", durationSec: 185.4 })).toBe("140 BPM · Am · 3:05");
    expect(beatFactsLine({ bpm: 69.5, bpmSource: "audio", key: null, durationSec: 59.6 })).toBe("≈70 BPM · 1:00");
  });

  it("turns beat file names into searches", () => {
    expect(beatQuery('[FREE] Dark Trap Type Beat - "Night" (prod. X) 140bpm')).toBe("Dark Trap Type Beat Night");
    expect(beatQuery("Chill Lofi Type Beat")).toBe("Chill Lofi Type Beat");
    expect(beatQuery("night_drive_2026")).toBe("night drive type beat");
    expect(beatQuery("Melodic Drill Instrumental prod. by Someone")).toBe("Melodic Drill type beat");
    expect(beatQuery("[FREE] (prod. X)")).toBe("");
    expect(beatQuery("x".repeat(300)).length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
  });
});
