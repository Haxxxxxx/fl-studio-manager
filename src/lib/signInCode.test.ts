import { describe, expect, it } from "vitest";
import { cleanCode, isCodeComplete } from "./signInCode";

describe("sign-in code", () => {
  it("keeps digits only, pasted with spaces or dashes", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
    expect(cleanCode("1234567890")).toBe("12345678");
  });

  it("accepts 6 to 8 digits (the project's OTP length setting)", () => {
    expect(isCodeComplete("12345")).toBe(false);
    expect(isCodeComplete("123456")).toBe(true);
    expect(isCodeComplete("12345678")).toBe(true);
    expect(isCodeComplete("123456789")).toBe(false);
    expect(isCodeComplete("12a456")).toBe(false);
  });
});
