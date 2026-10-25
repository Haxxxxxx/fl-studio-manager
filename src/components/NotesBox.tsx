import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { notePreview, MAX_NOTE_CHARS } from "../lib/notes";
import { dict, tr } from "../i18n";

// A note under a saved prod or a beat in the Digger: collapsed to its first
// line until opened. The text is saved as you type (the workspace saves a
// moment later), and an empty note is removed.

const T = dict(
  {
    add: "Add notes",
    edit: "Notes",
    hide: "Hide notes",
    placeholder: "Lyrics, flow ideas, what to change… [Verse 1] / [Hook] headers work.",
    label: "Notes",
  },
  {
    add: "Ajouter des notes",
    edit: "Notes",
    hide: "Masquer les notes",
    placeholder: "Paroles, idées de flow, ce qu'il faut changer… Les titres [Couplet 1] / [Refrain] marchent.",
    label: "Notes",
  },
);

export function NotesBox({ value, onChange, startOpen = false }: { value: string | undefined; onChange: (text: string) => void; startOpen?: boolean }) {
  const t = tr(T);
  const [open, setOpen] = useState(startOpen);
  const preview = notePreview(value);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex min-w-0 items-center gap-1.5 self-start text-[11px] ${preview ? "text-body hover:text-cream" : "text-engrave hover:text-cream"}`}
      >
        <NotebookPen size={11} aria-hidden className="shrink-0" />
        <span className="truncate">{open ? t.hide : preview || t.add}</span>
      </button>
      {open && (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t.placeholder}
          aria-label={t.label}
          maxLength={MAX_NOTE_CHARS}
          rows={Math.min(14, Math.max(4, (value ?? "").split("\n").length + 1))}
          className="w-full resize-y rounded border border-rule bg-chassis px-2.5 py-2 font-mono text-xs leading-relaxed text-cream placeholder:text-engrave focus:border-hot focus:outline-none"
        />
      )}
    </div>
  );
}
