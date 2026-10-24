import { describe, expect, it } from "vitest";
import { isReadOnlyInstallError } from "./updaterErrors";

describe("updater errors", () => {
  it("recognises a read-only app location", () => {
    expect(isReadOnlyInstallError("Read-only file system (os error 30)")).toBe(true);
    expect(isReadOnlyInstallError("failed to rename: EROFS")).toBe(true);
    expect(isReadOnlyInstallError("Couldn't download: network timeout")).toBe(false);
    expect(isReadOnlyInstallError(undefined)).toBe(false);
  });
});
