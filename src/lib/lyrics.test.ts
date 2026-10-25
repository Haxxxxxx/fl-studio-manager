import { describe, expect, it } from "vitest";
import { parseNoteSections, syllableCount } from "./lyrics";

describe("syllableCount", () => {
  it("counts vowel groups per word, at least one per word", () => {
    expect(syllableCount("night run")).toBe(2);
    expect(syllableCount("money on my mind")).toBe(5);
    expect(syllableCount("sky high")).toBe(2);
    expect(syllableCount("psst")).toBe(1);
  });

  it("drops a mute final e after a consonant (English and French)", () => {
    expect(syllableCount("make")).toBe(1);
    expect(syllableCount("des rimes")).toBe(2);
    expect(syllableCount("be")).toBe(1);
    expect(syllableCount("free")).toBe(1);
  });

  it("handles accents and elisions", () => {
    expect(syllableCount("j'suis là")).toBe(3);
    expect(syllableCount("été")).toBe(2);
    expect(syllableCount("cœur")).toBe(1);
  });

  it("is 0 without letters", () => {
    expect(syllableCount("")).toBe(0);
    expect(syllableCount("  123 -- !")).toBe(0);
  });
});

describe("parseNoteSections", () => {
  it("turns [..] lines into headings and keeps the others with a count", () => {
    expect(parseNoteSections("[Hook]\nnight run\n\n [Verse 1] \nmake it")).toEqual([
      { kind: "heading", text: "Hook" },
      { kind: "line", text: "night run", syllables: 2 },
      { kind: "blank" },
      { kind: "heading", text: "Verse 1" },
      { kind: "line", text: "make it", syllables: 2 },
    ]);
  });

  it("collapses blank runs and trims blank edges", () => {
    expect(parseNoteSections("\n\nflow\r\n\r\n\n  \nidea\n\n")).toEqual([
      { kind: "line", text: "flow", syllables: 1 },
      { kind: "blank" },
      { kind: "line", text: "idea", syllables: 2 },
    ]);
  });

  it("keeps brackets inside a line as text", () => {
    expect(parseNoteSections("say it [x2]")[0]).toMatchObject({ kind: "line", text: "say it [x2]" });
    expect(parseNoteSections("[]")[0]).toMatchObject({ kind: "line" });
  });

  it("is empty for no note", () => {
    expect(parseNoteSections(undefined)).toEqual([]);
    expect(parseNoteSections("  \n ")).toEqual([]);
  });
});
