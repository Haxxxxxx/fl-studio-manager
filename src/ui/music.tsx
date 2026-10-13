// Music-specific building blocks: mixdown state, song lists, files, and the
// Launch Kit's field rows and checks.
import { useState } from "react";
import { ClipboardCopy, FolderOpen, RotateCcw } from "lucide-react";
import { renderFreshness } from "../lib/songs";
import { LOW_CONFIDENCE, type Check as KitCheck, type KitField } from "../lib/launchKit";
import type { AiFieldReview, ProjectInfo } from "../types";
import { engrave, input, StatusDot } from "./base";

const MIX_STATE = {
  fresh: { color: "#3ddc84", short: "Current", label: "Mix current", title: "Mixdown is newer than the last save" },
  stale: { color: "#ffc233", short: "Outdated", label: "Mix outdated", title: "Project was saved after the last mixdown" },
  none: { color: "#ff4040", short: "None", label: "No mixdown", title: "No mixdown found for this song" },
} as const;

/** Whether the newest mixdown is current, outdated, or missing: an LED and
 * a word. `short` uses one word (under a Mixdown column header); `compact`
 * keeps just the LED (the word moves to the tooltip). */
export function MixdownBadge({ project, compact = false, short = false }: { project: ProjectInfo; compact?: boolean; short?: boolean }) {
  const f = renderFreshness(project);
  const state = MIX_STATE[f === "fresh" ? "fresh" : f === "none" ? "none" : "stale"];
  return (
    <span
      className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.08em] text-cream"
      title={state.title}
      role={compact ? "img" : undefined}
      aria-label={compact ? state.label : undefined}
    >
      <StatusDot color={state.color} />
      {!compact && (short ? state.short : state.label)}
    </span>
  );
}

/** Clickable list of songs: title, optional sub-label, right-aligned value. */
export function SongLines({ items, onOpen }: { items: { id: string; title: string; sub?: string; right: string }[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col">
      {items.map((it) => (
        <button key={it.id} onClick={() => onOpen(it.id)} className="flex items-center gap-3 rounded px-1 py-1 text-left text-xs hover:bg-panel">
          <span className="min-w-0 flex-1 truncate text-cream">{it.title}</span>
          {it.sub && <span className="text-body">{it.sub}</span>}
          <span className="w-20 text-right tabular-nums text-engrave">{it.right}</span>
        </button>
      ))}
    </div>
  );
}

/** One file location: icon, label, detail and a Show-in-folder button on hover. */
export function FileRow({ icon, label, detail, onReveal }: { icon: React.ReactNode; label: string; detail: string; onReveal?: () => void }) {
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-panel">
      <span className="text-engrave">{icon}</span>
      <span className="w-[92px] shrink-0 text-engrave">{label}</span>
      <span className="min-w-0 flex-1 truncate text-body" title={detail}>
        {detail}
      </span>
      {onReveal && (
        <button onClick={onReveal} title="Show in folder" className="shrink-0 rounded p-0.5 text-engrave opacity-0 hover:bg-rule hover:text-cream group-hover:opacity-100">
          <FolderOpen size={12} />
        </button>
      )}
    </div>
  );
}

/** Where a Launch Kit value came from. Sources differ by shape, not just
 * hue: LED dot (detected, suggested), dashed (AI draft), cream outline
 * (edited), solid orange (needs you). */
export const SOURCE_STYLE: Record<KitField["source"], { label: string; className: string; led?: string }> = {
  detected: { label: "Detected", className: "border border-rule-strong text-body", led: "#3ddc84" },
  suggested: { label: "Suggested", className: "border border-rule-strong text-body", led: "#5598e7" },
  ai: { label: "AI draft", className: "border border-dashed border-engrave text-body" },
  edited: { label: "Edited", className: "border border-cream text-cream" },
  missing: { label: "Needs you", className: "border border-hot bg-hot font-medium text-chassis" },
};

/** The source badge for one Launch Kit field. */
export function SourceBadge({ source }: { source: KitField["source"] }) {
  const s = SOURCE_STYLE[source];
  return (
    <span className={`flex items-center gap-1.5 rounded px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.1em] ${s.className}`}>
      {s.led && <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.led }} />}
      {s.label}
    </span>
  );
}

export const VERDICT_LABEL: Record<AiFieldReview["verdict"], string> = {
  ok: "AI: looks right",
  check: "AI: worth a look",
  wrong: "AI: looks wrong",
};

/** Launch Kit readiness: how many fields need you, or reviewed/ready. */
export function KitStatus({
  missing,
  warnings,
  accepted,
  aiVerified,
  onJump,
}: {
  missing: number;
  warnings: number;
  accepted: boolean;
  aiVerified: boolean;
  /** Go to the next field that needs you (the plate becomes a button). */
  onJump?: () => void;
}) {
  const plate = "flex items-center gap-2 rounded px-3 py-1 font-display text-[15px] font-bold uppercase tracking-[0.04em]";
  if (missing) {
    const label = `${missing} need${missing === 1 ? "s" : ""} you${warnings ? ` · ${warnings} to check` : ""}`;
    return onJump ? (
      <button
        onClick={onJump}
        title="Go to the next field that needs you"
        className={`${plate} bg-hot text-chassis hover:bg-hot-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream`}
      >
        {label}
      </button>
    ) : (
      <span className={`${plate} bg-hot text-chassis`}>{label}</span>
    );
  }
  return (
    <span className={`${plate} border border-rule-strong text-cream`}>
      <StatusDot color={accepted ? "#3ddc84" : "#ffc233"} />
      {accepted ? "Ready to export" : "Ready to review"}
      {aiVerified && " · AI-verified"}
      {warnings ? ` · ${warnings} to check` : ""}
    </span>
  );
}

/** A warning (amber LED) or missing-answer (red LED) line. */
export function CheckLine({ check }: { check: KitCheck }) {
  return (
    <div className="flex items-start gap-2 text-xs text-cream">
      <span className="flex h-4 shrink-0 items-center">
        <StatusDot color={check.level === "missing" ? "#ff4040" : "#ffc233"} size={7} />
      </span>
      <span>{check.message}</span>
    </div>
  );
}

/** The AI reviewer's verdict on a field, with its suggestion and a Use button. */
export function AiLine({ review, onUse }: { review: AiFieldReview & { stale: boolean }; onUse: (v: string) => void }) {
  const low = review.confidence < LOW_CONFIDENCE;
  const led = review.stale ? "#5a5850" : review.verdict === "wrong" ? "#ff4040" : review.verdict === "check" || low ? "#ffc233" : "#3ddc84";
  return (
    <div className="flex flex-col gap-1.5 rounded border border-dashed border-[#5a5850] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={engrave}>AI review</span>
        {review.suggestion && !review.stale && (
          <button
            onClick={() => onUse(review.suggestion!)}
            className="rounded border border-rule-strong px-2.5 py-0.5 font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-cream hover:bg-raised"
          >
            Use
          </button>
        )}
      </div>
      <div className={`flex items-start gap-2 text-xs ${review.stale ? "text-engrave" : "text-body"}`}>
        <span className="flex h-4 shrink-0 items-center">
          <StatusDot color={led} size={7} glow={!review.stale} />
        </span>
        <span>
          <span className="font-medium text-cream">{VERDICT_LABEL[review.verdict]}</span> · {Math.round(review.confidence * 100)}% sure
          {low && !review.stale && <span className="ml-1 rounded border border-warn/60 px-1 font-mono text-[10px] uppercase text-warn">low confidence</span>}
          {review.reason && ` · ${review.reason}`}
          {review.stale && " (checked an earlier value)"}
        </span>
      </div>
      {review.suggestion && !review.stale && (
        <span className="min-w-0 truncate font-mono text-xs text-cream" title={review.suggestion}>
          → {review.suggestion}
        </span>
      )}
    </div>
  );
}

/** One Launch Kit field: label, source badge, note, editor, checks and AI review. */
export function FieldRow({ field, onChange, bare = false }: { field: KitField; onChange: (v: string | undefined) => void; bare?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      id={`kit-field-${field.id}`}
      data-kit-field={field.id}
      data-needs-you={field.check?.level === "missing" ? "" : undefined}
      className={`flex flex-col gap-1.5 rounded-md ${bare ? "" : "py-3 first:pt-0 last:pb-0"}`}
    >
      <div className="flex items-center gap-2">
        {!bare && <span className="text-xs font-medium text-body">{field.label}</span>}
        <SourceBadge source={field.source} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-engrave" title={field.note}>
          {field.note}
        </span>
        {field.source === "edited" && (
          <button onClick={() => onChange(undefined)} title="Back to the generated value" className="flex items-center gap-1 text-[11px] text-engrave hover:text-cream">
            <RotateCcw size={11} /> Reset
          </button>
        )}
        {field.kind === "multiline" && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(field.value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="flex items-center gap-1 text-[11px] text-engrave hover:text-cream"
          >
            <ClipboardCopy size={11} /> {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {field.kind === "choice" ? (
        <div className="flex gap-1.5">
          {field.options!.map((o) => (
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`rounded-md border px-3 py-1 text-sm ${field.value === o ? "border-cream bg-cream text-chassis" : "border-rule text-body hover:bg-raised"}`}
            >
              {o}
            </button>
          ))}
        </div>
      ) : field.kind === "multiline" ? (
        <textarea value={field.value} onChange={(e) => onChange(e.target.value)} rows={field.id === "captions" ? 10 : 11} className={`${input} resize-y font-mono text-xs leading-relaxed`} />
      ) : (
        <input
          type={field.kind === "date" ? "date" : "text"}
          value={field.value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.source === "missing" ? "Type it once" : undefined}
          className={`${input} [color-scheme:dark] ${field.source === "missing" ? "!border-hot" : ""}`}
        />
      )}
      {field.check && <CheckLine check={field.check} />}
      {field.review && <AiLine review={field.review} onUse={(v) => onChange(v)} />}
    </div>
  );
}
