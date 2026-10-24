import { describe, expect, it } from "vitest";
import { MAX_EXCLUDE, MAX_FOUND_TITLES, MAX_QUERY_CHARS, beatFactsLine, beatQuery, deeperExclude, foundKey, foundTitles, googleSearchUrl, youtubeId, youtubeSearchUrl } from "./digger";

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

  it("lists the beats a deeper round must skip by title and site, once each, capped", () => {
    const l = (text: string, site = "BeatStars") => ({ text, site });
    expect(foundKey(l(" Night Drive ", " beatstars.com "))).toBe("night drive | beatstars.com");
    expect(foundKey(l("x".repeat(300))).length).toBe(120);
    expect(deeperExclude([l("A"), l("B")], [[l("b"), l("C")], [l("D")]])).toEqual(["a | beatstars", "b | beatstars", "c | beatstars", "d | beatstars"]);
    const many = Array.from({ length: 70 }, (_, i) => l(`Beat ${i}`));
    expect(deeperExclude(many, []).length).toBe(MAX_EXCLUDE);
    expect(deeperExclude([], [])).toEqual([]);
  });

  it("lists the titles already shown, once each, clipped and capped", () => {
    expect(foundTitles([" Night  Drive ", "", "night drive", "Cold Room", "x".repeat(300)])).toEqual(["Night Drive", "Cold Room", "x".repeat(120)]);
    expect(foundTitles(Array.from({ length: 70 }, (_, i) => `Beat ${i}`)).length).toBe(MAX_FOUND_TITLES);
    expect(foundTitles([])).toEqual([]);
  });

  it("reads the video ID of YouTube links only", () => {
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL1")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/results?search_query=beat")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=too-short")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ/../x")).toBeNull();
    expect(youtubeId("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://notyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(youtubeId("https://www.beatstars.com/beat/night-123")).toBeNull();
    expect(youtubeId("javascript:alert(1)")).toBeNull();
    expect(youtubeId("")).toBeNull();
  });
});
