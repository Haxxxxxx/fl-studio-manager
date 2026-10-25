import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toB64url } from "./bytes";
import { aad, EnvelopeError, open, openRequest, openResponse, ReplayGuard, seal, sealRequest, sealResponse } from "./envelope";

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const key = rnd(32);
const dev = toB64url(rnd(16));
const NOW = 1_800_000_000_000;

describe("envelope", () => {
  it("uses the contract's AAD strings", () => {
    expect(new TextDecoder().decode(aad("DEV", "/v1/notes", false))).toBe("hivo-sync-v1|DEV|/v1/notes");
    expect(new TextDecoder().decode(aad("DEV", "/v1/notes", true))).toBe("hivo-sync-v1|DEV|/v1/notes|resp");
  });

  it("round-trips a request and a response", () => {
    const env = sealRequest(key, dev, "/v1/snapshot", { a: "é🎤" }, rnd, NOW);
    expect(Object.keys(env).sort()).toEqual(["c", "n"]);
    expect(env.n).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 bytes
    expect(openRequest(key, dev, "/v1/snapshot", env, NOW + 5000, new ReplayGuard())).toEqual({ a: "é🎤" });

    const resp = sealResponse(key, dev, "/v1/snapshot", { ok: true, body: { items: [] } }, rnd);
    expect(openResponse(key, dev, "/v1/snapshot", resp)).toEqual({ ok: true, body: { items: [] } });
    const err = sealResponse(key, dev, "/v1/snapshot", { ok: false, error: "demo" }, rnd);
    expect(openResponse(key, dev, "/v1/snapshot", err)).toEqual({ ok: false, error: "demo" });
  });

  it("carries ts and a 16-byte nonce in the request plaintext", () => {
    const env = sealRequest(key, dev, "/v1/hello", {}, rnd, NOW);
    const plain = JSON.parse(open(key, aad(dev, "/v1/hello", false), env));
    expect(plain.ts).toBe(NOW);
    expect(plain.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(plain.body).toEqual({});
  });

  it("rejects a wrong key, device, path, or the request/response AAD swap", () => {
    const env = seal(key, aad(dev, "/v1/notes", false), "{}", rnd);
    expect(() => open(rnd(32), aad(dev, "/v1/notes", false), env)).toThrow(EnvelopeError);
    expect(() => open(key, aad("other", "/v1/notes", false), env)).toThrow(EnvelopeError);
    expect(() => open(key, aad(dev, "/v1/snapshot", false), env)).toThrow(EnvelopeError);
    expect(() => open(key, aad(dev, "/v1/notes", true), env)).toThrow(EnvelopeError);
    const resp = sealResponse(key, dev, "/v1/notes", { ok: true, body: {} }, rnd);
    expect(() => openResponse(key, dev, "/v1/snapshot", resp)).toThrow(EnvelopeError);
  });

  it("rejects tampering and junk", () => {
    const env = seal(key, aad(dev, "/p", false), "hello", rnd);
    const c = Buffer.from(env.c, "base64url");
    c[0] ^= 1;
    expect(() => open(key, aad(dev, "/p", false), { n: env.n, c: c.toString("base64url") })).toThrow(EnvelopeError);
    for (const junk of [null, "x", {}, { n: 1, c: 2 }, { n: "abc", c: env.c }, { n: env.n, c: "" }]) {
      expect(() => open(key, aad(dev, "/p", false), junk)).toThrow(EnvelopeError);
    }
  });

  it("rejects a stale ts and a replayed nonce (desktop rules)", () => {
    const guard = new ReplayGuard();
    const old = sealRequest(key, dev, "/v1/notes", {}, rnd, NOW - 121_000);
    expect(() => openRequest(key, dev, "/v1/notes", old, NOW, guard)).toThrow(/stale/);
    const future = sealRequest(key, dev, "/v1/notes", {}, rnd, NOW + 121_000);
    expect(() => openRequest(key, dev, "/v1/notes", future, NOW, guard)).toThrow(/stale/);
    const env = sealRequest(key, dev, "/v1/notes", {}, rnd, NOW);
    expect(openRequest(key, dev, "/v1/notes", env, NOW, guard)).toEqual({});
    expect(() => openRequest(key, dev, "/v1/notes", env, NOW + 1000, guard)).toThrow(/replay/);
  });
});
