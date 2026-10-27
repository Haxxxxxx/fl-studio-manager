import { describe, expect, it } from "vitest";
import {
  applyIdeaResults,
  applyIdeaStatuses,
  createIdea,
  deleteIdea,
  editIdea,
  ideasToPush,
  MAX_TITLE_CHARS,
  newId,
  parseIdeaResults,
  resetSent,
  visibleIdeas,
  type Idea,
} from "./ideas";

const rnd = (n: number) => Uint8Array.from({ length: n }, (_, i) => i * 7);

describe("ideas", () => {
  it("makes ids the desktop accepts", () => {
    expect(newId(rnd)).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("edits bump updatedAt, unchanged edits don't, titles are capped", () => {
    let list = [createIdea("a", 10, { title: "Cold room" })];
    list = editIdea(list, "a", { title: "Cold room" }, 20);
    expect(list[0].updatedAt).toBe(10);
    list = editIdea(list, "a", { text: "lights off" }, 20);
    expect(list[0].updatedAt).toBe(20);
    list = editIdea(list, "a", { title: "x".repeat(MAX_TITLE_CHARS + 5) }, 5);
    expect(list[0].title.length).toBe(MAX_TITLE_CHARS);
    expect(list[0].updatedAt).toBe(21);
  });

  it("pushes what changed since sent, never an empty one", () => {
    const list = [createIdea("a", 1, { title: "t" }), createIdea("b", 1), { ...createIdea("c", 1, { title: "t" }), sentAt: 1 }];
    expect(ideasToPush(list).map((i) => i.id)).toEqual(["a"]);
  });

  it("applies results; an edit made during the push stays to push", () => {
    let list: Idea[] = [createIdea("a", 1, { title: "t" })];
    const sent = ideasToPush(list);
    list = editIdea(list, "a", { title: "t2" }, 5);
    list = applyIdeaResults(list, sent, [{ id: "a", status: "stored", filedTo: null }]);
    expect(list[0].sentAt).toBe(1);
    expect(list[0].status).toBe("stored");
    expect(ideasToPush(list).map((i) => i.id)).toEqual(["a"]);
  });

  it("locks filed ideas; deletes go through the desktop once sent", () => {
    let list: Idea[] = [{ ...createIdea("a", 1, { title: "t" }), sentAt: 1, status: "filed", filedTo: "song:/x.flp" }];
    expect(editIdea(list, "a", { title: "new" }, 9)[0].title).toBe("t");
    expect(ideasToPush(list)).toEqual([]);
    // Never sent: gone right away. Sent: kept as deleted until the desktop answers.
    expect(deleteIdea([createIdea("b", 1)], "b", 2)).toEqual([]);
    list = deleteIdea([{ ...createIdea("c", 1, { title: "t" }), sentAt: 1, status: "stored" }], "c", 2);
    expect(list[0].deleted).toBe(true);
    expect(visibleIdeas(list)).toEqual([]);
    const sent = ideasToPush(list);
    expect(sent.length).toBe(1);
    expect(applyIdeaResults(list, sent, [{ id: "c", status: "deleted", filedTo: null }])).toEqual([]);
  });

  it("parses results and later statuses", () => {
    expect(parseIdeaResults({ results: [{ id: "a", status: "filed", filedTo: "x" }, { id: 3 }, { id: "b", status: "weird" }] })).toEqual([{ id: "a", status: "filed", filedTo: "x" }]);
    expect(parseIdeaResults({})).toBeNull();
    const list = [{ ...createIdea("a", 1, { title: "t" }), sentAt: 1, status: "stored" as const }];
    expect(applyIdeaStatuses(list, new Map([["a", { status: "filed", filedTo: "song:/x" }]]))[0].status).toBe("filed");
  });

  it("a new pairing sends everything again", () => {
    const list = [{ ...createIdea("a", 1, { title: "t" }), sentAt: 1, status: "filed" as const }, { ...createIdea("b", 1), deleted: true, sentAt: 1 }];
    expect(resetSent(list)).toEqual([{ ...list[0], sentAt: null, status: null, filedTo: null }]);
  });
});
