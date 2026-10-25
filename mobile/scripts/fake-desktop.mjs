// A stand-in for the Hivo desktop's phone sync server (PHONE-SYNC contract v1),
// for trying the phone app without the desktop. Sample data only.
//
//   node scripts/fake-desktop.mjs [host]      (default host 127.0.0.1)
//
// Prints a pairing URL. In the iOS Simulator: paste it on the Pair screen, or
//   xcrun simctl openurl booted "<url>"
// Written independently of src/lib on purpose: it cross-checks the phone's
// envelope against a second implementation of the contract.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";

const host = process.argv[2] ?? "127.0.0.1";
const deviceId = randomBytes(16).toString("base64url");
const key = randomBytes(32);
const seen = new Map();
let phoneName = "phone";

const fnv = (s) => {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(s, "utf8")) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
};
const item = (kind, id, title, subtitle, bpm, k, extra = {}) => ({ kind, id, title, subtitle, bpm, key: k, url: null, stage: null, note: "", noteHash: fnv(""), ...extra });
const items = [
  item("prod", "1a2b3c4d", "Dark piano loop", "Sample Producer · 2025", 142, "F#m", { url: "https://www.youtube.com/results?search_query=dark+piano+type+beat" }),
  item("prod", "5e6f7a8b", "Bouncy flute", "Another Producer · 2026", 98, null, { url: "https://www.youtube.com/results?search_query=flute+type+beat" }),
  item("beat", "/beats/night-drive.wav", "night-drive", "beats", 128, "Am"),
  item("beat", "/beats/slow-burn.mp3", "slow-burn", "beats", 76, "C"),
  item("song", "/projects/Track One/Track One.flp", "Track One", "Production", 140, "Gm", { stage: "production" }),
  item("song", "/projects/Idea 7/Idea 7.flp", "Idea 7", "Creation", null, null, { stage: "creation" }),
];
items[4].note = "[Hook]\nplaceholder line";
items[4].noteHash = fnv(items[4].note);

const aad = (path, resp) => Buffer.from(`hivo-sync-v1|${deviceId}|${path}${resp ? "|resp" : ""}`);
function reply(res, path, payload) {
  const n = randomBytes(24);
  const c = xchacha20poly1305(key, n, aad(path, true)).encrypt(Buffer.from(JSON.stringify(payload)));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ n: n.toString("base64url"), c: Buffer.from(c).toString("base64url") }));
}

createServer((req, res) => {
  const path = req.url ?? "";
  if (req.method === "GET" && path === "/v1/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ app: "hivo", v: 1 }));
  }
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    let body;
    try {
      if (req.headers["x-hivo-device"] !== deviceId) throw new Error("device");
      const env = JSON.parse(raw);
      const plain = JSON.parse(Buffer.from(xchacha20poly1305(key, Buffer.from(env.n, "base64url"), aad(path, false)).decrypt(Buffer.from(env.c, "base64url"))).toString("utf8"));
      if (Math.abs(Date.now() - plain.ts) > 120_000 || seen.has(plain.nonce)) throw new Error("replay");
      seen.set(plain.nonce, Date.now());
      body = plain.body;
    } catch (e) {
      console.log(`401 ${path} (${e.message})`);
      res.writeHead(401);
      return res.end();
    }
    console.log(`200 ${path}`, JSON.stringify(body).slice(0, 200));
    if (path === "/v1/hello") phoneName = String(body.phoneName ?? "phone").slice(0, 60);
    if (path === "/v1/hello") return reply(res, path, { ok: true, body: { desktopName: "Fake desktop", hivoVersion: "0.5.x" } });
    if (path === "/v1/snapshot") return reply(res, path, { ok: true, body: { items, generatedAt: Date.now() } });
    if (path === "/v1/notes") {
      const results = body.changes.map((c) => {
        const it = items.find((i) => i.kind === c.kind && i.id === c.id);
        if (!it) return { kind: c.kind, id: c.id, status: "missing", note: "", noteHash: fnv("") };
        const conflict = it.noteHash !== c.baseHash && it.note !== c.text && it.note !== "";
        it.note = conflict ? `${it.note}\n\n--- from ${phoneName} ---\n${c.text}` : c.text;
        it.noteHash = fnv(it.note);
        return { kind: c.kind, id: c.id, status: conflict ? "conflict" : "applied", note: it.note, noteHash: it.noteHash };
      });
      return reply(res, path, { ok: true, body: { results } });
    }
    reply(res, path, { ok: false, error: "unknown path" });
  });
}).listen(0, "0.0.0.0", function () {
  const port = this.address().port;
  console.log(`Fake Hivo desktop on port ${port}. Pairing URL:\n`);
  console.log(`hivo://pair?v=1&d=${deviceId}&k=${key.toString("base64url")}&h=${host}&p=${port}&n=${encodeURIComponent("Fake desktop")}\n`);
  console.log("Edit a note on the desktop side: type `edit <text>` here (changes Track One's note).");
});

process.stdin.setEncoding("utf8");
process.stdin.on("data", (line) => {
  const m = /^edit (.*)/s.exec(line.trim());
  if (m) {
    items[4].note = m[1];
    items[4].noteHash = fnv(m[1]);
    console.log("Track One's note is now:", m[1]);
  }
});
