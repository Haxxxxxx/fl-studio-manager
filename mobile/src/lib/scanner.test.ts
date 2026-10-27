import { describe, expect, it } from "vitest";
import { CAMERA_APP_INTENT, SCAN_TIMEOUT_MS, scannerFailure } from "./scanner";

describe("camera app hand-over", () => {
  it("waits 10-15 seconds, as asked", () => {
    expect(SCAN_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
    expect(SCAN_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
  it("uses the intent declared in the manifest queries", async () => {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { addQueries } = require("../../plugins/withPlayServicesVisibility.js");
    const m = addQueries({ manifest: {} });
    expect(m.manifest.queries[0].intent[0].action[0].$["android:name"]).toBe(CAMERA_APP_INTENT);
  });
});

describe("scannerFailure", () => {
  it("treats a cancel as a cancel, by code or by message", () => {
    expect(scannerFailure(Object.assign(new Error("x"), { code: "ERR_BARCODE_SCANNING_CANCELLED" }))).toBe("cancelled");
    expect(scannerFailure(new Error("Barcode scanning was cancelled"))).toBe("cancelled");
  });
  it("falls back to the in-app camera on anything else", () => {
    expect(scannerFailure(new Error("Google Play Services is not available on this device. This feature requires Google Play Services."))).toBe("fallback");
    expect(scannerFailure(new Error("Barcode scanning failed"))).toBe("fallback");
    expect(scannerFailure(undefined)).toBe("fallback");
    expect(scannerFailure("boom")).toBe("fallback");
  });
});
