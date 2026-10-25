import { describe, expect, it } from "vitest";
import { MAX_NOTE_CHARS, notePreview, setNote } from "./notes";

describe("setNote", () => {
  it("keeps the text as typed, caps it, and removes blank notes", () => {
    // Typed key by key: a trailing space or new line must survive.
    const a = setNote(undefined, "8fd69810", "[Hook]\nnight run \n");
    expect(a).toEqual({ "8fd69810": "[Hook]\nnight run \n" });
    const b = setNote(a, "/beats/x.wav", "flow idea");
    expect(Object.keys(b)).toEqual(["8fd69810", "/beats/x.wav"]);
    expect(a).toEqual({ "8fd69810": "[Hook]\nnight run \n" }); // input untouched
    expect(setNote(b, "8fd69810", "   \n ")).toEqual({ "/beats/x.wav": "flow idea" });
    expect(setNote(undefined, "k", "x".repeat(MAX_NOTE_CHARS + 50)).k).toHaveLength(MAX_NOTE_CHARS);
  });
});

describe("notePreview", () => {
  it("shows the first non-empty line, shortened", () => {
    expect(notePreview("\n  \n[Verse 1]\nline")).toBe("[Verse 1]");
    expect(notePreview(undefined)).toBe("");
    expect(notePreview("a".repeat(100), 10)).toBe("aaaaaaaaa…");
  });
});
