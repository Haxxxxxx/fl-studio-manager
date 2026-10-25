// Byte helpers that work the same in Hermes and Node (no Buffer, no atob).

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP: Record<string, number> = Object.fromEntries([...ALPHABET].map((ch, i) => [ch, i]));

/** base64url without padding (the contract's encoding for every binary field). */
export function toB64url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}

/** Decodes base64url (padding tolerated). Returns null on any invalid input. */
export function fromB64url(text: string): Uint8Array | null {
  const s = text.replace(/=+$/, "");
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (const ch of s) {
    const v = LOOKUP[ch];
    if (v === undefined) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out;
}

/** UTF-8 encoding by hand: Hermes builds differ on TextEncoder/TextDecoder. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    let c = ch.codePointAt(0) ?? 0;
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd; // lone surrogate
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Strict UTF-8 decoding: throws on malformed input. */
export function fromUtf8(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const cont = (k: number): number => {
    const b = bytes[k];
    if (b === undefined || (b & 0xc0) !== 0x80) throw new Error("invalid utf-8");
    return b & 63;
  };
  while (i < bytes.length) {
    const b = bytes[i];
    let c: number;
    if (b < 0x80) { c = b; i += 1; }
    else if ((b & 0xe0) === 0xc0) { c = ((b & 31) << 6) | cont(i + 1); if (c < 0x80) throw new Error("invalid utf-8"); i += 2; }
    else if ((b & 0xf0) === 0xe0) { c = ((b & 15) << 12) | (cont(i + 1) << 6) | cont(i + 2); if (c < 0x800 || (c >= 0xd800 && c <= 0xdfff)) throw new Error("invalid utf-8"); i += 3; }
    else if ((b & 0xf8) === 0xf0) { c = ((b & 7) << 18) | (cont(i + 1) << 12) | (cont(i + 2) << 6) | cont(i + 3); if (c < 0x10000 || c > 0x10ffff) throw new Error("invalid utf-8"); i += 4; }
    else throw new Error("invalid utf-8");
    out += String.fromCodePoint(c);
  }
  return out;
}

/** fnv1a-32 over the UTF-8 bytes, 8 lowercase hex digits ("" → 811c9dc5).
 * Same function as the desktop's leadHash, without its trim: a note's hash
 * covers the exact text. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const b of utf8(text)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
