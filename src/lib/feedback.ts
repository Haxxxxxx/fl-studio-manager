// "Report a bug / send feedback": a mailto link to the person who runs the
// app, with the facts they always ask for (version, OS, where you were)
// already filled in. No backend, no tracking: it opens the user's mail app.

/** Address the button writes to; set at build time, the button is hidden without it. */
export const FEEDBACK_EMAIL: string | null = (import.meta.env.VITE_FEEDBACK_EMAIL ?? "").trim() || null;

export interface FeedbackContext {
  /** App version ("0.4.0"), or "dev" outside a build. */
  version: string;
  /** "macOS", "Windows", "Linux" or "unknown". */
  os: string;
  /** The view the user was on (the sidebar id). */
  view: string;
  lang: "fr" | "en";
}

const TEXT = {
  en: {
    subject: (v: string, os: string) => `Hivo feedback (${v}, ${os})`,
    body: "What happened:\n\n\nWhat you expected:\n\n\n",
  },
  fr: {
    subject: (v: string, os: string) => `Retour Hivo (${v}, ${os})`,
    body: "Ce qui s'est passé :\n\n\nCe que tu attendais :\n\n\n",
  },
};

/** The OS family from a browser user agent string. */
export function osFromUserAgent(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "unknown";
}

/** The mailto URL for a feedback email to `to`, with the context in the subject and the footer. */
export function feedbackMailto(to: string, ctx: FeedbackContext): string {
  const t = TEXT[ctx.lang];
  const subject = t.subject(ctx.version, ctx.os);
  const body = `${t.body}—\nHivo ${ctx.version} · ${ctx.os} · ${ctx.view}`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
