import { describe, expect, it } from "vitest";
import { MAX_EXCLUDE, MAX_FOUND_TITLES, MAX_LIKED, MAX_QUERY_CHARS, beatFactsLine, beatQuery, deeperExclude, foundKey, foundTitles, googleSearchUrl, likedTitles, searchesDone, seedList, toggleLiked, youtubeId, youtubeSearchUrl } from "./digger";

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

  it(`picks results for the next round, at most ${MAX_LIKED}, titles cleaned; picking again unpicks`, () => {
    let liked = toggleLiked([], "v1", "  Night  Drive ");
    liked = toggleLiked(liked, "https://www.beatstars.com/beat/x", "");
    expect(liked).toEqual([
      { id: "v1", title: "Night Drive" },
      { id: "https://www.beatstars.com/beat/x", title: "https://www.beatstars.com/beat/x" },
    ]);
    expect(toggleLiked(liked, "v1", "Night Drive")).toEqual([{ id: "https://www.beatstars.com/beat/x", title: "https://www.beatstars.com/beat/x" }]);
    expect(toggleLiked([], "v2", "x".repeat(300))[0].title.length).toBe(120);
    let full: ReturnType<typeof toggleLiked> = [];
    for (let i = 0; i < MAX_LIKED + 5; i++) full = toggleLiked(full, `v${i}`, `Beat ${i}`);
    expect(full.length).toBe(MAX_LIKED);
    expect(toggleLiked(full, "v0", "Beat 0").length).toBe(MAX_LIKED - 1);
  });

  it("lists the picks' titles for the round, once each, capped, and sums them up for a tooltip", () => {
    expect(likedTitles([{ id: "a", title: "Night Drive" }, { id: "b", title: "night drive" }, { id: "c", title: "Cold Room" }])).toEqual(["Night Drive", "Cold Room"]);
    expect(likedTitles(Array.from({ length: 30 }, (_, i) => ({ id: `v${i}`, title: `Beat ${i}` }))).length).toBe(MAX_LIKED);
    expect(likedTitles([])).toEqual([]);
    expect(seedList(["A", "B"])).toBe("A, B");
    expect(seedList(["A", "B", "C", "D", "E"])).toBe("A, B, C +2");
    expect(seedList([])).toBe("");
  });

  it("lists the searches earlier rounds ran, once each, capped", () => {
    expect(searchesDone([{ queries: ["a", " b "] }, { queries: ["b", "", "c"] }])).toEqual(["a", "b", "c"]);
    expect(searchesDone(Array.from({ length: 9 }, (_, i) => ({ queries: Array.from({ length: 8 }, (_, j) => `q${i}-${j}`) }))).length).toBe(50);
    expect(searchesDone([])).toEqual([]);
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
