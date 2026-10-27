import { describe, expect, it } from "vitest";
import { scannerFailure } from "./scanner";

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
