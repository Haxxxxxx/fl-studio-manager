import { describe, expect, it } from "vitest";
import type { Album, Person, ProjectInfo, SongMeta } from "../types";
import { artistLine, buildKit, kitFiles, kitTitleFor, masterBaseName, verify, type KitInput } from "./launchKit";

const today = new Date(2026, 9, 13); // Tue 13 Oct 2026
const people: Person[] = [
  { id: "a", name: "Ana", aliases: [], contact: "", notes: "" },
  { id: "b", name: "Ben", aliases: [], contact: "", notes: "" },
  { id: "c", name: "Cleo", aliases: [], contact: "", notes: "" },
];
const project = (over: Partial<ProjectInfo> = {}) =>
  ({
    path: "/p/Night Run v3.flp",
    name: "Night Run v3",
    tempoBpm: 140,
    genre: null,
    artist: null,
    trackNames: [],
    renders: [],
    ...over,
  }) as unknown as ProjectInfo;
const input = (meta: SongMeta = {}, over: Partial<KitInput> = {}): KitInput => ({
  project: project(),
  meta,
  people,
  albums: [],
  analysis: null,
  today,
  language: "French",
  labelName: "Night Crew",
  ...over,
});
const value = (kit: ReturnType<typeof buildKit>, id: string) => kit.find((f) => f.id === id)!.value;

describe("artists and featuring", () => {
  const meta: SongMeta = {
    credits: [
      { personId: "a", role: "Lead rap", split: 50 },
      { personId: "b", role: "feat.", split: 20 },
      { personId: "c", role: "Producer", split: 30 },
    ],
  };
  it("keeps featured artists out of the main artist field", () => {
    const kit = buildKit(input(meta));
    expect(value(kit, "artists")).toBe("Ana");
    expect(value(kit, "featuring")).toBe("Ben");
    expect(artistLine("Ana", "Ben")).toBe("Ana feat. Ben");
    expect(masterBaseName(kit, "x")).toBe("Ana feat. Ben - Night Run");
  });

  it("lists songwriters with roles and splits from the credits", () => {
    expect(value(buildKit(input(meta)), "songwriters")).toBe("Ana (Lead rap) 50%; Ben (feat.) 20%; Cleo (Producer) 30%");
  });

  it("falls back to the artist from FL Studio's project info", () => {
    expect(value(buildKit(input({}, { project: project({ artist: "Milo" }) })), "artists")).toBe("Milo");
  });

  it("prefers the title from FL Studio's project info over the file name", () => {
    expect(value(buildKit(input({}, { project: project({ flpTitle: "Night Run (Remix)" }) })), "title")).toBe("Night Run (Remix)");
    expect(value(buildKit(input()), "title")).toBe("Night Run");
  });
});

describe("songwriter splits", () => {
  it("must add up to 100%", () => {
    expect(verify("songwriters", "Ana 60%; Ben 30%")?.message).toMatch(/90%/);
    expect(verify("songwriters", "Ana 50%; Ben 50%")).toBeUndefined();
    expect(verify("songwriters", "Ana 50%; Ben")?.message).toMatch(/every writer/);
    expect(verify("songwriters", "")?.level).toBe("missing");
  });
});

describe("distribution defaults", () => {
  it("label is the crew, ℗ line is release year + label, language from settings", () => {
    const kit = buildKit(input());
    expect(value(kit, "label")).toBe("Night Crew");
    expect(value(kit, "copyright")).toBe("℗ 2026 Night Crew");
    expect(value(kit, "language")).toBe("French");
  });

  it("a single is its own release, track 1", () => {
    const kit = buildKit(input());
    expect(value(kit, "releaseType")).toBe("Single");
    expect(value(kit, "releaseTitle")).toBe("Night Run");
    expect(value(kit, "trackNumber")).toBe("1");
  });

  it("an album track gets the album's title, type and position", () => {
    const album: Album = { id: "al", title: "Night EP", kind: "ep", color: "", releaseDate: null, notes: "", trackPaths: ["/p/x.flp", "/p/Night Run v3.flp"], createdAtMs: 0 };
    const kit = buildKit(input({}, { albums: [album] }));
    expect([value(kit, "releaseType"), value(kit, "releaseTitle"), value(kit, "trackNumber")]).toEqual(["EP", "Night EP", "2"]);
  });

  it("checks ISRC and UPC formats, but they're optional", () => {
    expect(verify("isrc", "")).toBeUndefined();
    expect(verify("isrc", "FR-AB1-26-00001")).toBeUndefined();
    expect(verify("isrc", "nope")?.level).toBe("warn");
    expect(verify("upc", "123")?.level).toBe("warn");
    expect(verify("upc", "0123456789012")).toBeUndefined();
  });
});

describe("release timing", () => {
  it("suggests the first Friday 28+ days out", () => {
    expect(value(buildKit(input()), "releaseDate")).toBe("2026-11-13");
  });

  it("skips Fridays that already have a release (yours or the crew's)", () => {
    const kit = buildKit(input({}, { busyDates: ["2026-11-13", "2026-11-20"] }));
    expect(value(kit, "releaseDate")).toBe("2026-11-27");
    expect(kit.find((f) => f.id === "releaseDate")!.note).toMatch(/Skipped 2 Fridays/);
  });
});

describe("distributor sheet", () => {
  it("lays out every value in upload-form order", () => {
    const meta: SongMeta = { credits: [{ personId: "a", role: "Lead rap", split: 100 }] };
    const sheet = kitFiles(buildKit(input(meta)), [{ label: "Hook 15s", startSec: 42, lengthSec: 15 }], []).find((f) => f.name === "distributor-sheet.md")!.content;
    expect(sheet).toContain("- Release type: Single");
    expect(sheet).toContain("- Primary artist(s): Ana");
    expect(sheet).toContain("  - Ana (Lead rap) 100%");
    expect(sheet).toContain("- Preview / TikTok start: 0:42 (the Hook 15s snippet)");
    expect(sheet).toContain("- ISRC: (leave empty: assigned for free)");
    expect(sheet).toContain("- ℗ / © line: ℗ 2026 Night Crew");
  });
});

describe("kitTitleFor", () => {
  // The Files panel finds the exported kit folder by this name, so it must
  // agree with the title field the export writes.
  it("matches the kit's title field in every case", () => {
    const cases: [Partial<ProjectInfo>, SongMeta][] = [
      [{}, {}],
      [{ flpTitle: "Night Run (Remix)" }, {}],
      [{ flpTitle: "  " }, {}],
      [{ flpTitle: "Night Run (Remix)" }, { launchKit: { edits: { title: "Night Run" } } }],
    ];
    for (const [over, meta] of cases) {
      const p = project(over);
      expect(kitTitleFor(p, meta)).toBe(value(buildKit(input(meta, { project: p })), "title"));
    }
  });
});
