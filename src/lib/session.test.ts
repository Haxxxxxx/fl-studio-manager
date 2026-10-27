import { describe, expect, it } from "vitest";
import { barMs, clampCursor, moveSection, nextLine, sessionSections } from "./session";

const LYRICS = "intro line\n\n[Verse 1]\nfirst\nsecond\n\n[Hook]\n\n[Verse 2]\nthird\n";

describe("sessionSections", () => {
  it("cuts at headings, keeps empty sections, drops blanks", () => {
    expect(sessionSections(LYRICS)).toEqual([
      { heading: null, lines: ["intro line"] },
      { heading: "Verse 1", lines: ["first", "second"] },
      { heading: "Hook", lines: [] },
      { heading: "Verse 2", lines: ["third"] },
    ]);
  });
  it("a note without headings is one section; an empty note none", () => {
    expect(sessionSections("a\nb")).toEqual([{ heading: null, lines: ["a", "b"] }]);
    expect(sessionSections("  \n")).toEqual([]);
  });
});

describe("timing", () => {
  it("one bar of 4/4", () => {
    expect(barMs(120)).toBe(2000);
    expect(barMs(60)).toBe(4000);
    expect(barMs(null)).toBe(barMs(90));
    expect(barMs(0)).toBe(barMs(90));
    expect(barMs(999)).toBe(barMs(90));
  });
});

describe("cursor", () => {
  const s = sessionSections(LYRICS);
  it("walks line by line and skips empty sections", () => {
    expect(nextLine(s, { section: 0, line: 0 })).toEqual({ section: 1, line: 0 });
    expect(nextLine(s, { section: 1, line: 0 })).toEqual({ section: 1, line: 1 });
    expect(nextLine(s, { section: 1, line: 1 })).toEqual({ section: 3, line: 0 });
    expect(nextLine(s, { section: 3, line: 0 })).toBeNull();
    expect(nextLine([], { section: 0, line: 0 })).toBeNull();
  });
  it("moves by section, clamped", () => {
    expect(moveSection(s, { section: 1, line: 1 }, 1)).toEqual({ section: 2, line: 0 });
    expect(moveSection(s, { section: 0, line: 0 }, -1)).toEqual({ section: 0, line: 0 });
    expect(moveSection(s, { section: 3, line: 0 }, 5)).toEqual({ section: 3, line: 0 });
  });
  it("stays valid when the text shrinks", () => {
    expect(clampCursor(s.slice(0, 2), { section: 3, line: 4 })).toEqual({ section: 1, line: 1 });
    expect(clampCursor([], { section: 3, line: 4 })).toEqual({ section: 0, line: 0 });
  });
});
