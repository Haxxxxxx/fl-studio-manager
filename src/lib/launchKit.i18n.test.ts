import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectInfo } from "../types";
import { applyLang } from "../i18n";
import { buildKit, inEnglish, kitFiles, verify, type KitInput } from "./launchKit";

vi.mock("./tauri", () => ({ aiKit: vi.fn() }));
const { aiDisclosure } = await import("./ai");

afterEach(() => applyLang("en"));

const input: KitInput = {
  project: { path: "/p/Night Run.flp", name: "Night Run", tempoBpm: 140, genre: null, artist: null, trackNames: [], renders: [] } as unknown as ProjectInfo,
  meta: {},
  people: [],
  albums: [],
  analysis: null,
  today: new Date(2026, 9, 13),
};

describe("Launch Kit in French", () => {
  it("labels, notes and checks follow the app language", () => {
    applyLang("fr");
    const artists = buildKit(input).find((f) => f.id === "artists")!;
    expect(artists.label).toBe("Artiste(s)");
    expect(artists.check?.message).toBe("C'est qui l'artiste ?");
    expect(verify("upc", "123")?.message).toBe("Un UPC/EAN fait 12 ou 13 chiffres");
    expect(aiDisclosure(false)).toContain("jamais tes notes");
  });

  it("exported files stay in English whatever the app language", () => {
    const english = kitFiles(buildKit(input), [], [], "en");
    applyLang("fr");
    expect(inEnglish(() => kitFiles(buildKit(input), [], [], "en")).map((f) => f.content.replace(/"generatedAt": ".*"/, ""))).toEqual(
      english.map((f) => f.content.replace(/"generatedAt": ".*"/, "")),
    );
    // And the app is back in French afterwards.
    expect(buildKit(input).find((f) => f.id === "title")!.label).toBe("Titre");
  });
});
