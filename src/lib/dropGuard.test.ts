import { describe, expect, it, vi } from "vitest";
import { installDropGuard, isFileDrag } from "./dropGuard";

type Listener = (e: DragEvent) => void;

function fakeTarget() {
  const listeners = new Map<string, Listener>();
  return {
    listeners,
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
}

function dragEvent(type: string, types: string[]) {
  return { type, preventDefault: vi.fn(), dataTransfer: { types, dropEffect: "move" } } as unknown as DragEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe("drop guard", () => {
  it("tells OS file drags from in-app drags", () => {
    expect(isFileDrag(["Files"])).toBe(true);
    expect(isFileDrag(["application/x-song"])).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });

  it("refuses dropped files so the webview never navigates to them", () => {
    const target = fakeTarget();
    installDropGuard(target as never);
    const over = dragEvent("dragover", ["Files"]);
    const drop = dragEvent("drop", ["Files"]);
    target.listeners.get("dragover")!(over);
    target.listeners.get("drop")!(drop);
    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer!.dropEffect).toBe("none");
    expect(drop.preventDefault).toHaveBeenCalled();
  });

  it("leaves in-app drags alone and cleans up", () => {
    const target = fakeTarget();
    const off = installDropGuard(target as never);
    const drop = dragEvent("drop", ["application/x-song"]);
    target.listeners.get("drop")!(drop);
    expect(drop.preventDefault).not.toHaveBeenCalled();
    off();
    expect(target.listeners.size).toBe(0);
  });
});
