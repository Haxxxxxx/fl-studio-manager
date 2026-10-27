import { describe, expect, it } from "vitest";
import { logStageChanges, MAX_STAGE_LOG } from "./stageLog";
import { EMPTY_WORKSPACE } from "./songs";
import { applyRelinks } from "./relink";
import type { SongMeta, Workspace } from "../types";

const ws = (songs: Record<string, SongMeta>): Workspace => ({ ...EMPTY_WORKSPACE, songs });
const NOW = 1_800_000_000_000;

describe("logStageChanges", () => {
  it("logs a stage change with the move's own time", () => {
    const prev = ws({ "/a.flp": { status: "creation" } });
    const next = ws({ "/a.flp": { status: "production", stageUpdatedAtMs: NOW - 5 } });
    expect(logStageChanges(prev, next, NOW).songs["/a.flp"].stageLog).toEqual([{ stage: "production", atMs: NOW - 5 }]);
  });

  it("uses now when the move carries no new time", () => {
    const prev = ws({ "/a.flp": { status: "creation", stageUpdatedAtMs: 1 } });
    const next = ws({ "/a.flp": { status: "prep", stageUpdatedAtMs: 1 } });
    expect(logStageChanges(prev, next, NOW).songs["/a.flp"].stageLog).toEqual([{ stage: "prep", atMs: NOW }]);
  });

  it("counts a first stage on an untouched song (no stored stage = Creation)", () => {
    const prev = ws({});
    expect(logStageChanges(prev, ws({ "/a.flp": { status: "production" } }), NOW).songs["/a.flp"].stageLog).toHaveLength(1);
    expect(logStageChanges(prev, ws({ "/a.flp": { notes: "hi" } }), NOW).songs["/a.flp"].stageLog).toBeUndefined();
  });

  it("ignores edits that keep the stage, and returns the same workspace", () => {
    const prev = ws({ "/a.flp": { status: "prep" } });
    const next = ws({ "/a.flp": { status: "prep", notes: "new" } });
    expect(logStageChanges(prev, next, NOW)).toBe(next);
  });

  it("doesn't count a relink as a stage change", () => {
    const prev = ws({ "/old.flp": { status: "release" } });
    const next = applyRelinks(prev, [{ from: "/old.flp", to: "/new.flp", reason: "moved" }]);
    expect(logStageChanges(prev, next, NOW).songs["/new.flp"].stageLog).toBeUndefined();
  });

  it("appends and keeps the newest entries", () => {
    const log = Array.from({ length: MAX_STAGE_LOG }, (_, i) => ({ stage: i % 2 ? "prep" : "creation", atMs: i }) as const);
    const prev = ws({ "/a.flp": { status: "creation", stageLog: [...log] } });
    const out = logStageChanges(prev, ws({ "/a.flp": { status: "release", stageLog: [...log] } }), NOW).songs["/a.flp"].stageLog!;
    expect(out).toHaveLength(MAX_STAGE_LOG);
    expect(out[out.length - 1]).toEqual({ stage: "release", atMs: NOW });
    expect(out[0]).toEqual(log[1]);
  });
});
