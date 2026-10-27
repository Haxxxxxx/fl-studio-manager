import { describe, expect, it } from "vitest";
import { MAX_BANDLAB_URL, cleanBandlabUrl, songNameFromFile } from "./sketch";

describe("songNameFromFile", () => {
  it("turns an export's file name into a song name", () => {
    expect(songNameFromFile("Night Run.mp3")).toBe("Night Run");
    expect(songNameFromFile("Night_Run (Mixdown).wav")).toBe("Night Run");
    expect(songNameFromFile("Night Run - BandLab.m4a")).toBe("Night Run");
    expect(songNameFromFile("night run v2.aiff")).toBe("night run");
    expect(songNameFromFile("Hook idea.WAV")).toBe("Hook idea");
  });

  it("drops what a folder name can't hold", () => {
    expect(songNameFromFile('A/B: "C"?.mp3')).toBe("A B C");
    expect(songNameFromFile("...mp3")).not.toBe("..");
    expect(songNameFromFile("x".repeat(150) + ".mp3")).toHaveLength(100);
  });
});

describe("cleanBandlabUrl", () => {
  it("keeps https links", () => {
    expect(cleanBandlabUrl("  https://www.bandlab.com/track/abc123 ")).toBe("https://www.bandlab.com/track/abc123");
    expect(cleanBandlabUrl("")).toBe("");
    expect(cleanBandlabUrl("   ")).toBe("");
  });

  it("refuses anything else", () => {
    for (const bad of ["http://www.bandlab.com/x", "javascript:alert(1)", "bandlab.com/x", "https://", "https://a b.com", "file:///etc/passwd"]) {
      expect(cleanBandlabUrl(bad), bad).toBeNull();
    }
    expect(cleanBandlabUrl("https://bandlab.com/" + "x".repeat(MAX_BANDLAB_URL))).toBeNull();
  });
});
