// Music-specific building blocks: mixdown state, song lists, files, and the
// Launch Kit's field rows and checks.
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, FolderOpen, RotateCcw, Sparkles } from "lucide-react";
import { renderFreshness } from "../lib/songs";
import { LOW_CONFIDENCE, type Check as KitCheck, type KitField } from "../lib/launchKit";
import type { AiFieldReview, ProjectInfo } from "../types";
import { input } from "./base";

/** Whether the newest mixdown is current, outdated, or missing. */
export function MixdownBadge({ project }: { project: ProjectInfo }) {
  const f = renderFreshness(project);
  if (f === "none")
    return (
      <span className="text-xs text-white/45" aria-label="No mixdown">
        —
      </span>
    );
  if (f === "fresh")
    return (
      <span className="flex items-center text-emerald-400/80" title="Mixdown is newer than the last save" role="img" aria-label="Mixdown current">
        <CheckCircle2 size={13} />
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-amber-400/90" title="Project was saved after the last mixdown">
      <AlertTriangle size={12} /> Outdated
    </span>
  );
}

/** Clickable list of songs: title, optional sub-label, right-aligned value. */
export function SongLines({ items, onOpen }: { items: { id: string; title: string; sub?: string; right: string }[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex flex-col">
      {items.map((it) => (
        <button key={it.id} onClick={() => onOpen(it.id)} className="flex items-center gap-3 rounded px-1 py-1 text-left text-xs hover:bg-white/[0.04]">
          <span className="min-w-0 flex-1 truncate text-white/85">{it.title}</span>
          {it.sub && <span className="text-white/62">{it.sub}</span>}
          <span className="w-20 text-right tabular-nums text-white/55">{it.right}</span>
        </button>
      ))}
    </div>
  );
}

/** One file location: icon, label, detail and a Show-in-folder button on hover. */
export function FileRow({ icon, label, detail, onReveal }: { icon: React.ReactNode; label: string; detail: string; onReveal?: () => void }) {
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded px-1 py-0.5 hover:bg-white/[0.03]">
      <span className="text-white/55">{icon}</span>
      <span className="w-[92px] shrink-0 text-white/55">{label}</span>
      <span className="min-w-0 flex-1 truncate text-white/75" title={detail}>
        {detail}
      </span>
      {onReveal && (
        <button onClick={onReveal} title="Show in folder" className="shrink-0 rounded p-0.5 text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100">
          <FolderOpen size={12} />
        </button>
      )}
    </div>
  );
}

/** Where a Launch Kit value came from: badge label and colors per source. */
export const SOURCE_STYLE: Record<KitField["source"], { label: string; className: string }> = {
  detected: { label: "Detected", className: "bg-emerald-500/15 text-emerald-300" },
  suggested: { label: "Suggested", className: "bg-sky-500/15 text-sky-300" },
  ai: { label: "AI draft", className: "bg-violet-500/15 text-violet-300" },
  edited: { label: "Edited", className: "bg-orange-500/15 text-orange-300" },
  missing: { label: "Needs you", className: "bg-red-500/15 text-red-300" },
};

export const VERDICT_LABEL: Record<AiFieldReview["verdict"], string> = {
  ok: "AI: looks right",
  check: "AI: worth a look",
  wrong: "AI: looks wrong",
};

/** Launch Kit readiness: how many fields need you, or reviewed/ready. */
export function KitStatus({ missing, warnings, accepted, aiVerified }: { missing: number; warnings: number; accepted: boolean; aiVerified: boolean }) {
  if (missing) {
    return (
      <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-red-200">
        {missing} need{missing === 1 ? "s" : ""} you{warnings ? ` · ${warnings} to check` : ""}
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${accepted ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/70"}`}>
      <CheckCircle2 size={12} /> {accepted ? "Reviewed, ready to export" : "Ready to review"}
      {aiVerified && " · AI-verified"}
      {warnings ? ` · ${warnings} to check` : ""}
    </span>
  );
}

/** A warning (amber) or missing-answer (red) line. */
export function CheckLine({ check }: { check: KitCheck }) {
  const color = check.level === "missing" ? "text-red-300" : "text-amber-300";
  return (
    <div className={`flex items-start gap-1.5 text-xs ${color}`}>
      <AlertTriangle size={12} className="mt-px shrink-0" />
      <span>{check.message}</span>
    </div>
  );
}

/** The AI reviewer's verdict on a field, with its suggestion and a Use button. */
export function AiLine({ review, onUse }: { review: AiFieldReview & { stale: boolean }; onUse: (v: string) => void }) {
  const low = review.confidence < LOW_CONFIDENCE;
  const tone = review.stale
    ? "text-white/50"
    : review.verdict === "wrong"
      ? "text-red-300"
      : review.verdict === "check" || low
        ? "text-amber-300"
        : "text-emerald-300/80";
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-start gap-1.5 text-xs ${tone}`}>
        <Sparkles size={12} className="mt-px shrink-0" />
        <span>
          <span className="font-medium">{VERDICT_LABEL[review.verdict]}</span> · {Math.round(review.confidence * 100)}% sure
          {low && !review.stale && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px]">low confidence</span>}
          {review.reason && ` · ${review.reason}`}
          {review.stale && " (checked an earlier value)"}
        </span>
      </div>
      {review.suggestion && !review.stale && (
        <div className="ml-[18px] flex items-center gap-2 text-xs text-white/55">
          <span className="min-w-0 truncate" title={review.suggestion}>
            Suggests: <span className="text-white/80">{review.suggestion}</span>
          </span>
          <button onClick={() => onUse(review.suggestion!)} className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/15">
            Use
          </button>
        </div>
      )}
    </div>
  );
}

/** One Launch Kit field: label, source badge, note, editor, checks and AI review. */
export function FieldRow({ field, onChange, bare = false }: { field: KitField; onChange: (v: string | undefined) => void; bare?: boolean }) {
  const source = SOURCE_STYLE[field.source];
  const [copied, setCopied] = useState(false);
  return (
    <div className={`flex flex-col gap-1.5 ${bare ? "" : "py-3 first:pt-0 last:pb-0"}`}>
      <div className="flex items-center gap-2">
        {!bare && <span className="text-xs font-medium text-white/70">{field.label}</span>}
        <span className={`rounded px-1.5 py-px text-[10px] font-medium ${source.className}`}>{source.label}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/55" title={field.note}>
          {field.note}
        </span>
        {field.source === "edited" && (
          <button onClick={() => onChange(undefined)} title="Back to the generated value" className="flex items-center gap-1 text-[11px] text-white/58 hover:text-white">
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
            className="flex items-center gap-1 text-[11px] text-white/58 hover:text-white"
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
              className={`rounded-md border px-3 py-1 text-sm ${field.value === o ? "border-orange-400/60 bg-orange-500/15 text-orange-200" : "border-white/10 text-white/60 hover:bg-white/5"}`}
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
          className={`${input} [color-scheme:dark]`}
        />
      )}
      {field.check && <CheckLine check={field.check} />}
      {field.review && <AiLine review={field.review} onUse={(v) => onChange(v)} />}
    </div>
  );
}
