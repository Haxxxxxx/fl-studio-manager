import { afterEach, describe, expect, it } from "vitest";
import type { ProjectInfo, Workspace } from "../types";
import { applyLang } from "../i18n";
import { buildCalendar, undatedReleased } from "./calendar";

// Wednesday 14 Oct 2026; the release is the next Monday (5 days away, not a Friday).
const TODAY = new Date(2026, 9, 14);
const song = (name: string) => ({ path: `/p/${name}.flp`, name, modifiedAtMs: 0, renders: [] }) as unknown as ProjectInfo;
const ws: Workspace = {
  version: 2,
  songs: { "/p/A.flp": { status: "creation" } } as Workspace["songs"],
  albums: [{ id: "r1", title: "Tape", kind: "ep", color: "#fff", releaseDate: "2026-10-19", trackPaths: ["/p/A.flp", "/p/Gone.flp"] }] as Workspace["albums"],
  people: [],
};

describe("release calendar checks", () => {
  afterEach(() => applyLang("en"));

  it("explains what isn't ready", () => {
    const [entry] = buildCalendar([song("A")], ws, TODAY);
    expect(entry.checks.map((c) => c.message)).toEqual([
      "Not a Friday: new music drops worldwide on Fridays",
      "1 track not finished, and it's under a week away",
      "Launch Kit not accepted for 1 track",
      "1 track: mixdown outdated or missing (render before you export the kit)",
      "1 track not found (moved or renamed)",
    ]);
  });

  it("speaks French", () => {
    applyLang("fr");
    const [entry] = buildCalendar([song("A")], ws, TODAY);
    expect(entry.checks.map((c) => c.message)).toEqual([
      "Pas un vendredi : les nouveaux sons sortent partout le vendredi",
      "1 morceau pas fini, et c'est dans moins d'une semaine",
      "Launch Kit pas validé pour 1 morceau",
      "1 morceau : mixdown pas à jour ou absent (fais le rendu avant d'exporter le kit)",
      "1 morceau introuvable (déplacé ou renommé)",
    ]);
  });

  it("says when a track's kit date disagrees with its release's date", () => {
    const w: Workspace = {
      ...ws,
      songs: { "/p/A.flp": { status: "prep", launchKit: { edits: { releaseDate: "2026-11-06" } } } } as unknown as Workspace["songs"],
    };
    const [entry] = buildCalendar([song("A")], w, TODAY);
    expect(entry.checks.map((c) => c.message)).toContain("1 track has another date in its Launch Kit: the release's date is the one used");
  });
});

describe("undated released songs", () => {
  it("counts songs in Release or Promotion with no date anywhere", () => {
    const w: Workspace = {
      version: 2,
      songs: {
        "/p/A.flp": { status: "release" },
        "/p/B.flp": { status: "promotion", launchKit: { edits: { releaseDate: "2026-11-06" } } },
        "/p/C.flp": { status: "release" },
        "/p/D.flp": { status: "prep" },
        "/p/E.flp": { status: "release", archived: true },
      } as unknown as Workspace["songs"],
      albums: [{ id: "r", title: "T", kind: "ep", color: "#fff", releaseDate: "2026-12-04", trackPaths: ["/p/C.flp"] }] as Workspace["albums"],
      people: [],
    };
    expect(undatedReleased(["A", "B", "C", "D", "E"].map(song), w)).toBe(1);
  });
});
