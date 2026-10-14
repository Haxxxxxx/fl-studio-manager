import { afterEach, describe, expect, it } from "vitest";
import type { ProjectInfo, Workspace } from "../types";
import { applyLang } from "../i18n";
import { buildCalendar } from "./calendar";

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
      "1 morceau introuvable (déplacé ou renommé)",
    ]);
  });
});
