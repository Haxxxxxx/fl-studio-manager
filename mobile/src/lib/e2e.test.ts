// End to end against the real desktop server (src-tauri phone_sync.rs,
// `e2e_server_for_the_phone_client`, an ignored Rust test). Skipped unless
// HIVO_E2E_DIR is set; scripts/e2e-phone-sync.sh runs both sides.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toB64url } from "./bytes";
import { createClient, SyncError } from "./client";
import { createIdea, ideaPayload, parseIdeaResults } from "./ideas";
import { MAX_CHUNK_BYTES, parseInboxStatuses, uploadItem, type OutItem } from "./outbox";

const dir = process.env.HIVO_E2E_DIR;

describe.skipIf(!dir)("phone ↔ desktop, for real", () => {
  it("pushes an idea, uploads a sketch in chunks, reads the statuses", async () => {
    const d = dir as string;
    for (let i = 0; i < 600 && !existsSync(join(d, "ready")); i++) await new Promise((r) => setTimeout(r, 100));
    const port = Number(readFileSync(join(d, "ready"), "utf8"));
    const call = createClient({
      pairing: { deviceId: "e2eDevice0000000000000", key: toB64url(new Uint8Array(32).fill(9)), hosts: ["127.0.0.1"], port, desktopName: "E2E" },
      transport: (url, init) => fetch(url, init),
      random: (n) => crypto.getRandomValues(new Uint8Array(n)),
      now: Date.now,
    });
    try {
      const hello = (await call("/v1/hello", { phoneName: "E2E phone", appVersion: "0.7.0" })) as { desktopName: string };
      expect(hello.desktopName).toBe("Test desk");

      const idea = createIdea("idea1", Date.now(), { title: "Cold room", text: "lights off", target: { kind: "beat", id: "/b.wav", title: "Dark" } });
      expect(parseIdeaResults(await call("/v1/ideas", { ideas: [ideaPayload(idea)] }))).toEqual([{ id: "idea1", status: "stored", filedTo: null }]);

      const big = Uint8Array.from({ length: MAX_CHUNK_BYTES * 2 + 123 }, (_, i) => (i * 31) % 256);
      const small = new TextEncoder().encode("stems");
      const files: Record<string, Uint8Array> = { big, small };
      const item: OutItem = {
        id: "sketch1",
        type: "sketch",
        title: "Night run",
        target: null,
        createdAt: Date.now(),
        durationMs: null,
        files: [
          { uri: "big", name: "Night Run.mp3", size: big.length, done: false },
          { uri: "small", name: "stems.zip", size: small.length, done: false },
        ],
        state: "waiting",
        error: null,
        sentBytes: 0,
        status: null,
        filedTo: null,
        sentAt: null,
      };
      const io = {
        call,
        read: async (uri: string, offset: number, length: number) => files[uri].slice(offset, offset + length),
        exists: async (uri: string) => uri in files,
        sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
        now: Date.now,
      };
      const done = await uploadItem(io, item, () => {});
      expect(done.state).toBe("sent");

      // A memo of a type the desktop refuses: failed, nothing kept.
      const refused = await uploadItem(io, { ...item, id: "bad1", type: "memo", files: [{ uri: "small", name: "notes.txt", size: small.length, done: false }] }, () => {});
      expect(refused).toMatchObject({ state: "failed", error: "type" });

      const statuses = parseInboxStatuses(await call("/v1/inbox", {}));
      expect(statuses.get("sketch1")?.status).toBe("new");
      expect(statuses.get("idea1")?.status).toBe("new");
      await expect(call("/v1/upload/chunk", { itemId: "nope", fileIndex: 0, offset: 0, data: "" })).rejects.toBeInstanceOf(SyncError);
    } finally {
      writeFileSync(join(d, "stop"), "");
    }
    // What the desktop kept: the exact bytes.
    for (let i = 0; i < 50 && !existsSync(join(d, "result.json")); i++) await new Promise((r) => setTimeout(r, 100));
    const list = JSON.parse(readFileSync(join(d, "result.json"), "utf8")) as { itemId: string; files: { path: string; name: string }[] }[];
    const sketch = list.find((x) => x.itemId === "sketch1");
    expect(sketch?.files.map((f) => f.name)).toEqual(["Night Run.mp3", "stems.zip"]);
    expect(new Uint8Array(readFileSync(sketch!.files[0].path))).toEqual(Uint8Array.from({ length: MAX_CHUNK_BYTES * 2 + 123 }, (_, i) => (i * 31) % 256));
    expect(list.some((x) => x.itemId === "idea1")).toBe(true);
  }, 60_000);
});
