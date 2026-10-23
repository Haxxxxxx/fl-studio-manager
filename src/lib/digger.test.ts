import { describe, expect, it } from "vitest";
import { MAX_EXCLUDE, MAX_QUERY_CHARS, beatFactsLine, beatQuery, deeperExclude, googleSearchUrl, youtubeId, youtubeSearchUrl } from "./digger";

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

  it("lists the urls a deeper round must skip, once each, capped", () => {
    const l = (url: string) => ({ url });
    expect(deeperExclude([l("https://a/1"), l("https://a/2")], [[l("https://a/2"), l("https://a/3")], [l("https://a/4")]])).toEqual(["https://a/1", "https://a/2", "https://a/3", "https://a/4"]);
    const many = Array.from({ length: 70 }, (_, i) => l(`https://a/${i}`));
    expect(deeperExclude(many, []).length).toBe(MAX_EXCLUDE);
    expect(deeperExclude([], [])).toEqual([]);
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
