import { describe, expect, it } from "vitest";
import {
  BLOCK_VARIANTS,
  DASHBOARD_BLOCK_IDS,
  DEFAULT_LAYOUT,
  defaultLayout,
  hideBlock,
  isDefaultHidden,
  moveBlock,
  nextSize,
  normalizeLayout,
  setSize,
  setVariant,
  showBlock,
  sizeOf,
  variantOf,
  visibleBlocks,
} from "./dashboardLayout";

describe("dashboard layout", () => {
  it("the default shows every block once, in registry order, except the ones that start hidden", () => {
    const shown = DASHBOARD_BLOCK_IDS.filter((id) => !isDefaultHidden(id));
    expect(DEFAULT_LAYOUT.order).toEqual(shown);
    expect(DEFAULT_LAYOUT.hidden).toEqual(DASHBOARD_BLOCK_IDS.filter(isDefaultHidden));
    expect(visibleBlocks(DEFAULT_LAYOUT)).toEqual(shown);
    expect([...DEFAULT_LAYOUT.order, ...DEFAULT_LAYOUT.hidden].sort()).toEqual([...DASHBOARD_BLOCK_IDS].sort());
    expect(sizeOf(DEFAULT_LAYOUT, "stats")).toBe("full");
    expect(sizeOf(DEFAULT_LAYOUT, "pipeline")).toBe("half");
  });

  it("the tendency blocks start hidden, at half width", () => {
    for (const id of ["tempoKey", "workingHours", "yourSound", "collaborators", "songShape"] as const) {
      expect(isDefaultHidden(id)).toBe(true);
      expect(DEFAULT_LAYOUT.hidden).toContain(id);
      expect(sizeOf(DEFAULT_LAYOUT, id)).toBe("half");
    }
    expect(isDefaultHidden("stats")).toBe(false);
    expect(isDefaultHidden("activity")).toBe(false);
  });

  it("in a crew the three crew cards share a row", () => {
    expect(sizeOf(defaultLayout(false), "nextRelease")).toBe("half");
    expect(defaultLayout(false)).toBe(DEFAULT_LAYOUT);
    const crew = defaultLayout(true);
    expect(sizeOf(crew, "nextRelease")).toBe("third");
    expect(sizeOf(crew, "stalled")).toBe("third");
    expect(sizeOf(crew, "crewWho")).toBe("third");
    expect(sizeOf(crew, "pipeline")).toBe("half");
  });

  it("every block has at least one variant and the first is its default", () => {
    for (const id of DASHBOARD_BLOCK_IDS) {
      expect(BLOCK_VARIANTS[id].length).toBeGreaterThan(0);
      expect(variantOf(DEFAULT_LAYOUT, id)).toBe(BLOCK_VARIANTS[id][0]);
    }
  });

  describe("normalizeLayout", () => {
    it("turns garbage into the default", () => {
      expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
      expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
      expect(normalizeLayout("nope")).toEqual(DEFAULT_LAYOUT);
      expect(normalizeLayout({ order: "x", hidden: 3, variants: [], sizes: null })).toEqual(DEFAULT_LAYOUT);
    });

    it("drops unknown ids and duplicates, keeping the stored order", () => {
      const out = normalizeLayout({ order: ["pipeline", "bogus", "stats", "pipeline", 7], hidden: ["stats", "nope"] });
      expect(out.order.slice(0, 2)).toEqual(["pipeline", "stats"]);
      // "stats" was already in order, so it's not hidden twice.
      expect(out.hidden).toEqual(DEFAULT_LAYOUT.hidden);
      expect(new Set(out.order).size).toBe(out.order.length);
    });

    it("appends blocks a stored layout doesn't know, so new ones show up", () => {
      const out = normalizeLayout({ order: ["pitches"], hidden: ["stats"] });
      expect(out.order[0]).toBe("pitches");
      expect(out.hidden).toEqual(["stats", ...DASHBOARD_BLOCK_IDS.filter(isDefaultHidden)]);
      expect([...out.order, ...out.hidden].sort()).toEqual([...DASHBOARD_BLOCK_IDS].sort());
      expect(out.order).not.toContain("stats");
      expect(out.order).toEqual(["pitches", ...DASHBOARD_BLOCK_IDS.filter((id) => id !== "pitches" && id !== "stats" && !isDefaultHidden(id))]);
    });

    it("blocks that start hidden go to `hidden` when the stored layout doesn't know them, never to the order", () => {
      // A layout saved before the tendency blocks existed.
      const old = normalizeLayout({ order: ["stats", "activity"], hidden: ["storage"] });
      expect(old.order).not.toContain("tempoKey");
      expect(old.hidden).toContain("tempoKey");
      expect(old.hidden).toContain("songShape");
      expect(visibleBlocks(old)).not.toContain("workingHours");
      // The user's own placement of a tendency block is kept.
      const placed = normalizeLayout({ order: ["tempoKey", "stats"], hidden: [] });
      expect(placed.order.slice(0, 2)).toEqual(["tempoKey", "stats"]);
      expect(placed.hidden).toEqual(DASHBOARD_BLOCK_IDS.filter((id) => isDefaultHidden(id) && id !== "tempoKey"));
      // Garbage gives the default, tendency blocks hidden.
      expect(normalizeLayout(undefined).hidden).toEqual(DEFAULT_LAYOUT.hidden);
    });

    it("showBlock puts a default-hidden block on the grid, at the bottom", () => {
      const shown = showBlock(DEFAULT_LAYOUT, "collaborators");
      expect(shown.order[shown.order.length - 1]).toBe("collaborators");
      expect(shown.hidden).not.toContain("collaborators");
      expect(normalizeLayout(JSON.parse(JSON.stringify(shown)))).toEqual(shown);
    });

    it("checks variants and sizes against the registry", () => {
      const out = normalizeLayout({
        variants: { activity: "heatmap", pipeline: "pie", stats: "tiles", bogus: "x", pickUp: 3 },
        sizes: { pipeline: "full", stats: "huge", nope: "half" },
      });
      expect(out.variants).toEqual({ activity: "heatmap" });
      expect(out.sizes.pipeline).toBe("full");
      expect(out.sizes.stats).toBeUndefined();
      expect(out.sizes.nextRelease).toBe("half");
    });

    it("fills missing sizes from the given defaults", () => {
      const out = normalizeLayout({ sizes: { stalled: "full" } }, defaultLayout(true));
      expect(out.sizes.stalled).toBe("full");
      expect(out.sizes.nextRelease).toBe("third");
    });
  });

  describe("edits", () => {
    it("moveBlock reorders the visible list and clamps", () => {
      const first = DEFAULT_LAYOUT.order[0];
      const moved = moveBlock(DEFAULT_LAYOUT, first, 2);
      expect(moved.order.indexOf(first)).toBe(2);
      expect(moved.order.length).toBe(DEFAULT_LAYOUT.order.length);
      expect(moveBlock(DEFAULT_LAYOUT, first, 999).order[DEFAULT_LAYOUT.order.length - 1]).toBe(first);
      expect(moveBlock(DEFAULT_LAYOUT, "stats", -5).order[0]).toBe("stats");
      expect(moveBlock(DEFAULT_LAYOUT, "stats", 0)).not.toBe(DEFAULT_LAYOUT);
      expect(moveBlock(DEFAULT_LAYOUT, "stats", 0).order).toEqual(DEFAULT_LAYOUT.order);
      expect(moveBlock(hideBlock(DEFAULT_LAYOUT, "stats"), "stats", 0).order).not.toContain("stats");
    });

    it("hideBlock and showBlock move a block between the lists; show appends", () => {
      const hidden = hideBlock(DEFAULT_LAYOUT, "stats");
      expect(hidden.order).not.toContain("stats");
      expect(hidden.hidden).toEqual([...DEFAULT_LAYOUT.hidden, "stats"]);
      expect(visibleBlocks(hidden)).not.toContain("stats");
      expect(hideBlock(hidden, "stats")).toBe(hidden);
      const shown = showBlock(hidden, "stats");
      expect(shown.hidden).toEqual(DEFAULT_LAYOUT.hidden);
      expect(shown.order[shown.order.length - 1]).toBe("stats");
      expect(showBlock(DEFAULT_LAYOUT, "stats")).toBe(DEFAULT_LAYOUT);
    });

    it("setVariant keeps only non-default looks and ignores unknown ones", () => {
      const heat = setVariant(DEFAULT_LAYOUT, "activity", "heatmap");
      expect(variantOf(heat, "activity")).toBe("heatmap");
      expect(setVariant(heat, "activity", "curve").variants).toEqual({});
      expect(setVariant(DEFAULT_LAYOUT, "activity", "pie")).toBe(DEFAULT_LAYOUT);
      expect(setVariant(DEFAULT_LAYOUT, "stalled", "cards")).toBe(DEFAULT_LAYOUT);
    });

    it("setSize and nextSize cycle full → half → third → full", () => {
      expect(sizeOf(setSize(DEFAULT_LAYOUT, "stats", "third"), "stats")).toBe("third");
      expect(nextSize("full")).toBe("half");
      expect(nextSize("half")).toBe("third");
      expect(nextSize("third")).toBe("full");
    });

    it("a normalized edited layout survives a round trip through JSON", () => {
      const edited = setSize(setVariant(moveBlock(hideBlock(DEFAULT_LAYOUT, "storage"), "pitches", 0), "pipeline", "counts"), "attention", "half");
      expect(normalizeLayout(JSON.parse(JSON.stringify(edited)))).toEqual(edited);
    });
  });
});
