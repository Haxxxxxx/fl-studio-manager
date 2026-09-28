import { useState } from "react";
import { Plus, Send, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { detectedPeople } from "../lib/people";
import type { PitchOutcome, ProjectInfo } from "../types";
import { btn, input } from "./ui";

export const ROLES = ["Producer", "Co-producer", "Vocals", "Feature", "Writer", "Mix", "Master", "Engineer", "Other"];

export const OUTCOMES: { id: PitchOutcome; label: string; tone: string }[] = [
  { id: "sent", label: "Sent", tone: "text-white/60" },
  { id: "listened", label: "Listened", tone: "text-white/70" },
  { id: "interested", label: "Interested", tone: "text-sky-300" },
  { id: "placed", label: "Placed", tone: "text-emerald-300" },
  { id: "sold", label: "Sold", tone: "text-emerald-300" },
  { id: "passed", label: "Passed", tone: "text-white/35" },
];

const today = () => new Date().toISOString().slice(0, 10);
const small = "rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-white/75";

/** Pick an existing person or type a new name (created on submit). */
function PersonPicker({ onPick, label }: { onPick: (personId: string) => void; label: string }) {
  const people = useAppStore((s) => s.workspace.people);
  const createPerson = useAppStore((s) => s.createPerson);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (naming || people.length === 0) {
    return (
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onPick(createPerson(name));
          setName("");
          setNaming(false);
        }}
      >
        <input autoFocus={naming} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={`${input} py-1 text-xs`} />
        <button type="submit" className={`${btn} py-1 text-xs`}>
          {label}
        </button>
        {people.length > 0 && (
          <button type="button" onClick={() => setNaming(false)} className="text-white/40 hover:text-white">
            <X size={13} />
          </button>
        )}
      </form>
    );
  }
  return (
    <label className={`${btn} relative cursor-pointer py-1 text-xs`}>
      <Plus size={12} /> {label}
      <select
        value=""
        onChange={(e) => (e.target.value === "__new" ? setNaming(true) : e.target.value && onPick(e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="" />
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="__new">+ New person…</option>
      </select>
    </label>
  );
}

export function SongCredits({ project }: { project: ProjectInfo }) {
  const people = useAppStore((s) => s.workspace.people);
  const meta = useAppStore((s) => s.workspace.songs[project.path]);
  const updateSong = useAppStore((s) => s.updateSong);
  const openPerson = useAppStore((s) => s.openPerson);
  const credits = meta?.credits ?? [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const suggested = detectedPeople(project, people).filter((p) => !credits.some((c) => c.personId === p.id));

  const setCredits = (next: typeof credits) => updateSong(project.path, { credits: next });
  const add = (personId: string, role = "Vocals") => {
    if (!credits.some((c) => c.personId === personId)) setCredits([...credits, { personId, role }]);
  };
  const splitTotal = credits.reduce((t, c) => t + (c.split ?? 0), 0);

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {credits.map((c, i) => (
          <div key={c.personId} className="flex items-center gap-2 text-xs">
            <button onClick={() => openPerson(c.personId)} className="min-w-0 flex-1 truncate text-left text-white/85 hover:underline">
              {byId.get(c.personId)?.name ?? "Unknown"}
            </button>
            <select
              value={c.role}
              onChange={(e) => setCredits(credits.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
              className={small}
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="bg-[#18181d]">
                  {r}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-0.5 text-white/40" title="Agreed split (%)">
              <input
                type="number"
                min={0}
                max={100}
                value={c.split ?? ""}
                placeholder="—"
                onChange={(e) =>
                  setCredits(
                    credits.map((x, j) =>
                      j === i ? { ...x, split: e.target.value === "" ? undefined : Math.max(0, Math.min(100, Number(e.target.value))) } : x,
                    ),
                  )
                }
                className={`${small} w-11 text-right`}
              />
              %
            </label>
            <button onClick={() => setCredits(credits.filter((_, j) => j !== i))} className="text-white/30 hover:text-white">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      {splitTotal > 100 && <div className="mt-1 text-[11px] text-amber-300">Splits add up to {splitTotal}%.</div>}

      {suggested.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-white/35">In this session:</span>
          {suggested.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id)}
              title="Found in the song's mixer/recording track names — click to credit"
              className="rounded-full border border-dashed border-white/20 px-2 py-0.5 text-[11px] text-white/60 hover:border-white/40 hover:text-white"
            >
              + {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2">
        <PersonPicker label="Credit someone" onPick={(id) => add(id, "Feature")} />
      </div>
    </div>
  );
}

export function SongPitches({ project }: { project: ProjectInfo }) {
  const people = useAppStore((s) => s.workspace.people);
  const pitches = useAppStore((s) => s.workspace.songs[project.path]?.pitches) ?? [];
  const addPitch = useAppStore((s) => s.addPitch);
  const updatePitch = useAppStore((s) => s.updatePitch);
  const removePitch = useAppStore((s) => s.removePitch);
  const openPerson = useAppStore((s) => s.openPerson);
  const byId = new Map(people.map((p) => [p.id, p]));
  const sorted = [...pitches].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      {sorted.length === 0 && <div className="mb-2 text-xs text-white/35">Not sent to anyone yet.</div>}
      <div className="flex flex-col gap-1.5">
        {sorted.map((p) => {
          const outcome = OUTCOMES.find((o) => o.id === p.outcome);
          return (
            <div key={p.id} className="group text-xs">
              <div className="flex items-center gap-2">
                <Send size={11} className="shrink-0 text-white/30" />
                <button onClick={() => openPerson(p.personId)} className="min-w-0 flex-1 truncate text-left text-white/85 hover:underline">
                  {byId.get(p.personId)?.name ?? "Unknown"}
                </button>
                <input
                  type="date"
                  value={p.date}
                  onChange={(e) => e.target.value && updatePitch(project.path, p.id, { date: e.target.value })}
                  className={`${small} w-[108px]`}
                />
                <select
                  value={p.outcome}
                  onChange={(e) => updatePitch(project.path, p.id, { outcome: e.target.value as PitchOutcome })}
                  className={`${small} ${outcome?.tone ?? ""}`}
                >
                  {OUTCOMES.map((o) => (
                    <option key={o.id} value={o.id} className="bg-[#18181d] text-white">
                      {o.label}
                    </option>
                  ))}
                </select>
                <button onClick={() => removePitch(project.path, p.id)} className="text-white/30 opacity-0 hover:text-white group-hover:opacity-100">
                  <X size={12} />
                </button>
              </div>
              <input
                value={p.note ?? ""}
                onChange={(e) => updatePitch(project.path, p.id, { note: e.target.value })}
                placeholder="Note (feedback, price, link…)"
                className="ml-5 mt-0.5 w-[calc(100%-1.25rem)] bg-transparent text-[11px] text-white/50 placeholder:text-white/20 focus:outline-none"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <PersonPicker label="Log a send" onPick={(personId) => addPitch(project.path, { personId, date: today(), outcome: "sent" })} />
      </div>
    </div>
  );
}

