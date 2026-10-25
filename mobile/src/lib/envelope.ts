// Hivo phone sync v1 envelope (PHONE-SYNC contract): XChaCha20-Poly1305,
// 24-byte random nonce, AAD = "hivo-sync-v1|" + deviceId + "|" + path,
// responses add "|resp". Pure: randomness and time are passed in.
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { fromB64url, fromUtf8, toB64url, utf8 } from "./bytes";

export type Envelope = { n: string; c: string };
export type RandomBytes = (n: number) => Uint8Array;

export const AAD_PREFIX = "hivo-sync-v1|";
export const NONCE_BYTES = 24;
export const REQUEST_NONCE_BYTES = 16;
export const MAX_SKEW_MS = 120_000;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeError";
  }
}

export function aad(deviceId: string, path: string, response: boolean): Uint8Array {
  return utf8(`${AAD_PREFIX}${deviceId}|${path}${response ? "|resp" : ""}`);
}

export function keyBytes(keyB64: string): Uint8Array {
  const k = fromB64url(keyB64);
  if (!k || k.length !== 32) throw new EnvelopeError("bad key");
  return k;
}

export function seal(key: Uint8Array, ad: Uint8Array, plaintext: string, random: RandomBytes): Envelope {
  const nonce = random(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) throw new EnvelopeError("bad nonce");
  const c = xchacha20poly1305(key, nonce, ad).encrypt(utf8(plaintext));
  return { n: toB64url(nonce), c: toB64url(c) };
}

/** Throws EnvelopeError when the envelope is malformed or fails to authenticate. */
export function open(key: Uint8Array, ad: Uint8Array, env: unknown): string {
  if (!env || typeof env !== "object") throw new EnvelopeError("not an envelope");
  const { n, c } = env as Record<string, unknown>;
  if (typeof n !== "string" || typeof c !== "string") throw new EnvelopeError("not an envelope");
  const nonce = fromB64url(n);
  const ct = fromB64url(c);
  if (!nonce || nonce.length !== NONCE_BYTES || !ct || ct.length < 16) throw new EnvelopeError("not an envelope");
  try {
    return fromUtf8(xchacha20poly1305(key, nonce, ad).decrypt(ct));
  } catch {
    throw new EnvelopeError("decrypt failed");
  }
}

/** The phone's request body for `path`: `{ts, nonce, body}` sealed with the request AAD. */
export function sealRequest(key: Uint8Array, deviceId: string, path: string, payload: unknown, random: RandomBytes, now: number): Envelope {
  const plain = JSON.stringify({ ts: now, nonce: toB64url(random(REQUEST_NONCE_BYTES)), body: payload });
  return seal(key, aad(deviceId, path, false), plain, random);
}

export type Reply = { ok: true; body: unknown } | { ok: false; error: string };

/** Opens the desktop's response for `path` (AAD suffixed `|resp`). */
export function openResponse(key: Uint8Array, deviceId: string, path: string, env: unknown): Reply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(open(key, aad(deviceId, path, true), env));
  } catch (e) {
    if (e instanceof EnvelopeError) throw e;
    throw new EnvelopeError("bad response json");
  }
  if (!parsed || typeof parsed !== "object") throw new EnvelopeError("bad response");
  const r = parsed as Record<string, unknown>;
  if (r.ok === true) return { ok: true, body: r.body };
  if (r.ok === false) return { ok: false, error: typeof r.error === "string" ? r.error : "error" };
  throw new EnvelopeError("bad response");
}

// The desktop's half, kept here so the tests (and a fake desktop) exercise the
// same rules: replay window and skew. The real one lives in phone_sync.rs.

export class ReplayGuard {
  private seen = new Map<string, number>();
  constructor(private windowMs = 10 * 60_000, private max = 10_000) {}
  /** True when the nonce is fresh (and records it). */
  check(nonce: string, now: number): boolean {
    for (const [n, at] of this.seen) {
      if (now - at > this.windowMs || this.seen.size > this.max) this.seen.delete(n);
      else break;
    }
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now);
    return true;
  }
}

export function openRequest(key: Uint8Array, deviceId: string, path: string, env: unknown, now: number, guard: ReplayGuard): unknown {
  const plain = JSON.parse(open(key, aad(deviceId, path, false), env)) as { ts?: unknown; nonce?: unknown; body?: unknown };
  if (typeof plain.ts !== "number" || Math.abs(now - plain.ts) > MAX_SKEW_MS) throw new EnvelopeError("stale");
  if (typeof plain.nonce !== "string" || !guard.check(plain.nonce, now)) throw new EnvelopeError("replay");
  return plain.body;
}

export function sealResponse(key: Uint8Array, deviceId: string, path: string, reply: Reply, random: RandomBytes): Envelope {
  return seal(key, aad(deviceId, path, true), JSON.stringify(reply), random);
}
