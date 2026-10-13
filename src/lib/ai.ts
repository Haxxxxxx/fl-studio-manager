import * as api from "./tauri";
import { briefSpecs, isoDate, parseDate, type KitField, type KitInput } from "./launchKit";
import { detectKey, detectedPeople } from "./people";
import type { AiFieldReview, KitFieldId, Settings } from "../types";

// The Launch Kit's AI layer (roadmap principle 2): Gemini drafts the copy,
// then a separate pass checks every field (its own drafts included) against
// the project's facts. Answers are sanitized here, so a confused model can
// flag things but never quietly rewrite measured values.

const MEASURED: KitFieldId[] = ["bpm", "duration"];
const LONG_TEXT: KitFieldId[] = ["captions", "coverBrief"];

/** Facts about the song, as sent to the model. No file paths or usernames. */
export function kitContext({ project, meta, people, albums, analysis, today = new Date() }: KitInput) {
  const name = (id: string) => people.find((p) => p.id === id)?.name;
  const release = albums.find((a) => a.trackPaths.includes(project.path));
  return {
    // Local dates: the UTC date is already tomorrow on an evening in the Americas.
    today: isoDate(today),
    projectName: project.name,
    pipelineStage: meta.status ?? "unsorted",
    tags: meta.tags ?? [],
    notes: (meta.notes ?? "").slice(0, 1500),
    tempoBpm: project.tempoBpm,
    timeSignature: project.timeSigNum && project.timeSigDenom ? `${project.timeSigNum}/${project.timeSigDenom}` : null,
    keySetInApp: meta.key ?? null,
    keyWrittenInTrackNames: detectKey(project.trackNames),
    mixdownDurationSec: analysis ? Math.round(analysis.durationSec) : null,
    mixerTrackNames: project.trackNames.slice(0, 80),
    credits: (meta.credits ?? []).flatMap((c) => (name(c.personId) ? [{ name: name(c.personId), role: c.role, split: c.split ?? null }] : [])),
    peopleFoundInTrackNames: detectedPeople(project, people).map((p) => p.name),
    release: release ? { title: release.title, kind: release.kind, date: release.releaseDate } : null,
    lastSavedInFl: isoDate(new Date(project.modifiedAtMs)),
  };
}

const call = (settings: Settings, system: string, prompt: string, schema: object, temperature: number) =>
  api.aiGenerateJson({ model: settings.aiModel, system, prompt, schema, temperature });

// ---- Drafting ----

const DRAFT_SCHEMA = {
  type: "OBJECT",
  properties: {
    announce: { type: "STRING" },
    teaser: { type: "STRING" },
    releaseDay: { type: "STRING" },
    concept: { type: "STRING" },
    palette: { type: "STRING" },
    imagery: { type: "STRING" },
    typography: { type: "STRING" },
    avoid: { type: "STRING" },
  },
  required: ["announce", "teaser", "releaseDay", "concept", "palette", "imagery", "typography", "avoid"],
};

const draftSystem = (language: string) => `You write release copy for a small independent rap crew that releases on Spotify and Deezer.
Rules:
- Use only facts from CONTEXT and FIELDS. Never invent stream counts, chart positions, features, quotes, places, labels, links or people.
- No placeholders; for links write "link in bio".
- Captions: short and punchy, native to Instagram and TikTok, at most 2 emojis and 3 hashtags each. Put the title in quotes and name the artist exactly as given. "announce" and "teaser" mention the release date as given; "releaseDay" says it's out now.
- Cover concept: art direction a designer can act on, drawn from the title, tags, notes, tempo and key. Concrete and visual, one strong idea. The only text on a cover is the title and artist name.
- Write everything in ${language}.`;

function fieldValues(fields: KitField[]) {
  return Object.fromEntries(fields.filter((f) => !LONG_TEXT.includes(f.id)).map((f) => [f.id, f.value]));
}

/** AI-written captions and cover brief, in the kit's text format. */
export async function draftCopy(input: KitInput, fields: KitField[], settings: Settings) {
  const prompt = `CONTEXT:\n${JSON.stringify(kitContext(input), null, 1)}\n\nFIELDS:\n${JSON.stringify(fieldValues(fields), null, 1)}`;
  const d = (await call(settings, draftSystem(settings.aiLanguage || "English"), prompt, DRAFT_SCHEMA, 0.8)) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
  if (!s("announce") || !s("concept")) throw new Error("Gemini's draft came back incomplete. Try again.");
  const value = (id: KitFieldId) => fields.find((f) => f.id === id)?.value ?? "";
  const captions = `ANNOUNCE\n${s("announce")}\n\nTEASER (post with the Hook snippet)\n${s("teaser")}\n\nRELEASE DAY\n${s("releaseDay")}`;
  const coverBrief = [
    ...briefSpecs(value("title"), value("artists")),
    "",
    `Concept: ${s("concept")}`,
    `Palette: ${s("palette")}`,
    `Imagery: ${s("imagery")}`,
    `Typography: ${s("typography")}`,
    `Avoid: ${s("avoid")}`,
  ].join("\n");
  const basis = { title: value("title"), artists: value("artists"), releaseDate: value("releaseDate") };
  return { captions, coverBrief, basis };
}

// ---- Verification ----

const reviewSchema = (ids: KitFieldId[]) => ({
  type: "OBJECT",
  properties: {
    fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", enum: ids },
          verdict: { type: "STRING", enum: ["ok", "check", "wrong"] },
          confidence: { type: "NUMBER" },
          reason: { type: "STRING" },
          suggestion: { type: "STRING" },
        },
        required: ["id", "verdict", "confidence", "reason", "suggestion"],
      },
    },
  },
  required: ["fields"],
});

const REVIEW_SYSTEM = `You are the verification layer of a music release tool. You check a release kit before it is marked ready: catch nonsense, inconsistencies and hallucinated facts.
Return exactly one entry for EVERY field in FIELDS:
- verdict: "ok" = consistent with the context and release-ready; "check" = plausible but a human should look; "wrong" = contradicts the context, is malformed, or states facts the context doesn't support.
- confidence: 0 to 1, how sure you are of your verdict.
- reason: one short sentence a musician understands.
- suggestion: a corrected value only when the verdict is "check" or "wrong" AND a better value follows from the context; otherwise "". Never suggest values for bpm or duration (they are measured). Dates as YYYY-MM-DD. explicit is "Yes" or "No".
Look for: titles that still look like file names or carry version tags (v2, final, master); artists or producers not supported by the credits or mixer track names; a genre that contradicts the tags or notes; captions or a cover brief that state facts missing from the context, or contradict the title, artist or release date; release dates in the past or not on a Friday; keys written in a non-standard way.
Judge only from the context. When the context can't confirm something, prefer "check" with lower confidence over "wrong".`;

/** Keeps only well-formed verdicts; measured fields never get suggestions. */
export function sanitizeReview(raw: unknown, fields: KitField[]): Partial<Record<KitFieldId, AiFieldReview>> {
  const out: Partial<Record<KitFieldId, AiFieldReview>> = {};
  const items = (raw as { fields?: unknown })?.fields;
  if (!Array.isArray(items)) return out;
  for (const item of items as Record<string, unknown>[]) {
    const field = fields.find((f) => f.id === item?.id);
    const verdict = item?.verdict;
    if (!field || (verdict !== "ok" && verdict !== "check" && verdict !== "wrong") || out[field.id]) continue;
    const confidence = Math.min(1, Math.max(0, Number(item.confidence)));
    let suggestion = typeof item.suggestion === "string" ? item.suggestion.trim() : "";
    const limit = LONG_TEXT.includes(field.id) ? 4000 : 200;
    if (
      verdict === "ok" ||
      MEASURED.includes(field.id) ||
      suggestion === field.value ||
      suggestion.length > limit ||
      (field.id === "releaseDate" && !parseDate(suggestion)) ||
      (field.id === "explicit" && suggestion !== "Yes" && suggestion !== "No")
    ) {
      suggestion = "";
    }
    out[field.id] = {
      verdict,
      confidence: Number.isFinite(confidence) ? confidence : 0.5,
      reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 300) : "",
      suggestion: suggestion || undefined,
      checkedValue: field.value,
    };
  }
  return out;
}

export async function reviewKit(input: KitInput, fields: KitField[], settings: Settings) {
  const values = Object.fromEntries(fields.map((f) => [f.id, f.value]));
  const prompt = `CONTEXT:\n${JSON.stringify(kitContext(input), null, 1)}\n\nFIELDS:\n${JSON.stringify(values, null, 1)}`;
  const raw = await call(settings, REVIEW_SYSTEM, prompt, reviewSchema(fields.map((f) => f.id)), 0.1);
  const review = sanitizeReview(raw, fields);
  if (Object.keys(review).length === 0) throw new Error("Gemini's check came back empty. Try again.");
  return review;
}
