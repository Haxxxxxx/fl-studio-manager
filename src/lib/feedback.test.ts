import { describe, expect, it } from "vitest";
import { feedbackMailto, osFromUserAgent } from "./feedback";

describe("feedback", () => {
  it("reads the OS family from the user agent", () => {
    expect(osFromUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605")).toBe("macOS");
    expect(osFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537")).toBe("Windows");
    expect(osFromUserAgent("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
    expect(osFromUserAgent("")).toBe("unknown");
  });

  it("builds a mailto with the version, OS and view filled in", () => {
    const url = feedbackMailto("crew@example.com", { version: "0.4.0", os: "macOS", view: "pipeline", lang: "en" });
    expect(url.startsWith("mailto:crew%40example.com?subject=")).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get("subject")).toBe("Hivo feedback (0.4.0, macOS)");
    const body = u.searchParams.get("body")!;
    expect(body).toContain("What happened:");
    expect(body.endsWith("Hivo 0.4.0 · macOS · pipeline")).toBe(true);
  });

  it("writes the template in French", () => {
    const u = new URL(feedbackMailto("crew@example.com", { version: "dev", os: "Windows", view: "digger", lang: "fr" }));
    expect(u.searchParams.get("subject")).toBe("Retour Hivo (dev, Windows)");
    expect(u.searchParams.get("body")).toContain("Ce qui s'est passé");
  });
});
