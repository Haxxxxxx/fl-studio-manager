import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FeedbackError,
  contextLine,
  scrubPaths,
  feedbackAsText,
  feedbackErrorKind,
  feedbackMailto,
  feedbackPayload,
  osFromUserAgent,
  submitFeedback,
  type FeedbackInput,
} from "./feedback";

const input: FeedbackInput = {
  installId: "11111111-2222-4333-8444-555555555555",
  category: "bug",
  message: "  The board jumps when I drag.  ",
  replyTo: " ana@example.com ",
  ctx: { version: "0.5.0", os: "macOS", view: "dashboard", lang: "en" },
};

describe("feedback", () => {
  it("blanks local paths before a report is prefilled", () => {
    expect(scrubPaths("not a folder on this computer: /Users/someone/Music/FL")).toBe("not a folder on this computer: <path>");
    expect(scrubPaths("could not write C:\\Users\\someone\\AppData\\settings.json")).toBe("could not write <path>");
    expect(scrubPaths("network path \\\\nas\\music refused")).toBe("network path <path> refused");
    expect(scrubPaths("Gemini took too long")).toBe("Gemini took too long");
  });
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

  it("says what gets attached", () => {
    expect(contextLine(input.ctx)).toBe("Hivo 0.5.0 · macOS · Dashboard · EN");
    expect(contextLine({ ...input.ctx, view: "crewBoard", lang: "fr" })).toBe("Hivo 0.5.0 · macOS · CrewBoard · FR");
  });

  it("builds the function's arguments, trimmed and clipped", () => {
    expect(feedbackPayload(input)).toEqual({
      p_install: input.installId,
      p_category: "bug",
      p_message: "The board jumps when I drag.",
      p_reply_to: "ana@example.com",
      p_app_version: "0.5.0",
      p_os: "macOS",
      p_view: "dashboard",
      p_lang: "en",
    });
    const long = feedbackPayload({ ...input, message: "x".repeat(5000), replyTo: "e".repeat(300) });
    expect(long.p_message).toHaveLength(4000);
    expect(long.p_reply_to).toHaveLength(200);
    expect(feedbackPayload({ ...input, replyTo: "   " }).p_reply_to).toBeNull();
  });

  it("copies as text with the category, context, reply address and message", () => {
    expect(feedbackAsText(input)).toBe("[bug] Hivo 0.5.0 · macOS · Dashboard · EN\nReply to: ana@example.com\n\nThe board jumps when I drag.");
    const text = feedbackAsText({ ...input, replyTo: "", message: "y".repeat(5000) });
    expect(text).not.toContain("Reply to:");
    expect(text.split("\n\n")[1]).toHaveLength(4000);
  });

  it("tells a rate limit, a network failure and anything else apart", () => {
    expect(feedbackErrorKind({ code: "P0001", message: "too many messages today" })).toBe("rate-limited");
    expect(feedbackErrorKind({ code: "P0001", message: "too many messages right now" })).toBe("rate-limited");
    expect(feedbackErrorKind({ code: "", message: "TypeError: Failed to fetch" })).toBe("network");
    expect(feedbackErrorKind(new TypeError("Load failed"))).toBe("failed");
    expect(feedbackErrorKind(new TypeError("NetworkError when attempting to fetch resource."))).toBe("network");
    expect(feedbackErrorKind({ code: "42501", message: "permission denied for function submit_feedback" })).toBe("failed");
    expect(feedbackErrorKind(undefined)).toBe("failed");
  });

  it("sends through the submit_feedback function and returns the id", async () => {
    const rpc = vi.fn(async () => ({ data: "feedback-id", error: null }));
    const client = { rpc } as unknown as SupabaseClient;
    await expect(submitFeedback(client, input)).resolves.toBe("feedback-id");
    expect(rpc).toHaveBeenCalledWith("submit_feedback", feedbackPayload(input));
  });

  it("throws a typed error when the function refuses or the request fails", async () => {
    const refused = { rpc: vi.fn(async () => ({ data: null, error: { code: "P0001", message: "too many messages today" } })) } as unknown as SupabaseClient;
    await expect(submitFeedback(refused, input)).rejects.toMatchObject({ name: "FeedbackError", kind: "rate-limited" });
    const offline = {
      rpc: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    } as unknown as SupabaseClient;
    const err = await submitFeedback(offline, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FeedbackError);
    expect((err as FeedbackError).kind).toBe("network");
  });
});
