import { describe, expect, it } from "vitest";
import { fnv1a, fromB64url, fromUtf8, toB64url, utf8 } from "./bytes";

describe("fnv1a", () => {
  it("matches the contract's test vectors", () => {
    expect(fnv1a("")).toBe("811c9dc5");
    expect(fnv1a("a")).toBe("e40c292c");
  });
  it("hashes UTF-8 bytes, like the desktop", () => {
    // Same loop as the desktop's leadHash over TextEncoder bytes.
    const ref = (s: string) => {
      let h = 0x811c9dc5;
      for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
      return h.toString(16).padStart(8, "0");
    };
    for (const s of ["[Hook]\nlà-bas", "émoji 🎤", " spaced "]) expect(fnv1a(s)).toBe(ref(s));
  });
});

describe("base64url", () => {
  it("round-trips every length without padding", () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      const s = toB64url(bytes);
      expect(s).not.toMatch(/[+/=]/);
      expect(Buffer.from(s, "base64url").equals(Buffer.from(bytes))).toBe(true);
      expect(fromB64url(s)).toEqual(bytes);
    }
  });
  it("rejects bad characters and impossible lengths", () => {
    expect(fromB64url("ab+c")).toBeNull();
    expect(fromB64url("abcde")).toBeNull();
  });
});

describe("utf8", () => {
  it("matches TextEncoder and round-trips", () => {
    for (const s of ["", "plain", "Prépa", "東京", "🎧🔥", "a\u0000b"]) {
      expect(utf8(s)).toEqual(new TextEncoder().encode(s));
      expect(fromUtf8(utf8(s))).toBe(s);
    }
  });
  it("rejects malformed bytes", () => {
    expect(() => fromUtf8(Uint8Array.from([0xc3]))).toThrow();
    expect(() => fromUtf8(Uint8Array.from([0xff]))).toThrow();
  });
});
