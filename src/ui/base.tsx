// FL Manager's UI library: the presentational building blocks every screen
// uses. Props only, no store access, so they render anywhere (and sync to
// Claude Design as the app's design system).
import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { STATUSES, UNSORTED, statusInfo } from "../lib/songs";
import type { SongStatus } from "../types";

/** Dot + label (never color alone), backed by a native select. */
export function StatusSelect({
  value,
  onChange,
  compact = false,
}: {
  value: SongStatus | undefined;
  onChange: (status: SongStatus | undefined) => void;
  compact?: boolean;
}) {
  const info = statusInfo(value);
  return (
    <label
      className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] ${
        compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <StatusDot color={info.color} />
      <span className="text-white/75">{info.label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || undefined) as SongStatus | undefined)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">{UNSORTED.label}</option>
        {STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function StatusDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color }}
    />
  );
}

export function TagEditor({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft("");
  };
  const unused = suggestions.filter((s) => !tags.includes(s)).slice(0, 8);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            #{t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="text-white/40 hover:text-white">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          placeholder="Add tag…"
          className="min-w-[80px] flex-1 bg-transparent py-0.5 text-xs text-white placeholder:text-white/25 focus:outline-none"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {unused.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-white/10 px-2 py-0.5 text-[11px] text-white/35 hover:border-white/25 hover:text-white/70"
            >
              +{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = "max-w-lg",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        className={`flex max-h-full w-full ${width} flex-col rounded-xl border border-white/10 bg-[#18181d] shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="text-sm font-semibold text-white/90">{title}</div>
          <button onClick={onClose} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
            <X size={15} />
          </button>
        </div>
        <div className="overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Two-step button for anything destructive: first click arms, second acts. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = "",
  disabled = false,
}: {
  label: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      disabled={disabled}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
      className={`${className} ${armed ? "!border-red-400/50 !bg-red-500/15 !text-red-300" : ""}`}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

export const btn =
  "flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40";
export const btnPrimary =
  "flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40";
export const input =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-orange-400/50 focus:outline-none";
export const sectionLabel = "text-[11px] font-medium uppercase tracking-wide text-white/35";


/** The app's dark surface: background, text color and the system font stack
 * (the same values as <body> in src/index.css). Every component is designed
 * for it: white text at reduced opacity on near-black. Wrap a screen in it. */
export function Theme({ children, className = "", padded = false }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div
      className={className}
      style={{
        background: "#0f0f12",
        color: "#e6e6ea",
        colorScheme: "dark",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
        padding: padded ? 16 : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** The app's button. Secondary (outlined) by default; primary for the one main action on a screen. */
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return <button {...props} className={`${variant === "primary" ? btnPrimary : btn} ${className}`} />;
}

/** Text input with the app's field styling. */
export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${input} ${className}`} />;
}

/** A titled panel. `action` sits at the right of the title row. */
export function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide text-white/40">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Big number with an icon and a small label. */
export function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-1.5 text-white/40">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

/** Compact number over a tiny label, for a row of hero figures. */
export function HeroStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-semibold leading-none text-white">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-white/35">{label}</div>
    </div>
  );
}

/** Boxed label/value pair. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/35">{label}</div>
      <div className="mt-0.5 text-base font-semibold text-white">{value}</div>
    </div>
  );
}

/** Labelled block inside a side panel. */
export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className={`${sectionLabel} mb-2`}>{label}</div>
      {children}
    </section>
  );
}

/** Definition-list label/value (use inside a <dl>). */
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-white/35">{label}</dt>
      <dd className="mt-0.5 text-white/80">{value}</dd>
    </div>
  );
}

/** Rounded filter pill. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
        active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

/** Outlined on/off button. */
export function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
        active ? "border-orange-400/50 bg-orange-500/15 text-orange-300" : "border-white/10 text-white/60 hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

/** Initials in a circle. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-white/10 font-semibold text-white/80"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

/** Label, value/total and a thin progress bar (green when complete). */
export function Meter({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-white/50">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">
          {value}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: value === total ? "#199e70" : "#3987e5" }} />
      </div>
    </div>
  );
}
