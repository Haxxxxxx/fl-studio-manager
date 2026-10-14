import { useEffect, useRef, useState } from "react";
import { ChevronUp, Users, X } from "lucide-react";
import { useCrewStore } from "../store/useCrewStore";
import { useAppStore } from "../store/useAppStore";
import { CrewHome } from "./CrewPanel";
import { StatusDot } from "./ui";

// The crew you're in, one click away from anywhere (bottom of the sidebar).
// The menu is the same crew panel as Settings (CrewHome): members, your role,
// switch crew, invite codes, leave, sync. Every action goes through the
// existing store calls, so the database's checks (RLS, security-definer
// functions) apply as before. Hidden when you're not in a crew.

export function CrewMenu() {
  const signedIn = useCrewStore((s) => !!s.userId);
  const crews = useCrewStore((s) => s.crews);
  const activeCrewId = useCrewStore((s) => s.activeCrewId);
  const members = useCrewStore((s) => s.members.length);
  const sync = useCrewStore((s) => s.sync.kind);
  const setView = useAppStore((s) => s.setView);
  const setPipelineBoard = useAppStore((s) => s.setPipelineBoard);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const active = crews.find((c) => c.id === activeCrewId) ?? crews[0];
  if (!signedIn || !active) return null;
  const light = sync === "error" ? "var(--color-missing)" : sync === "synced" ? "var(--color-ok)" : "var(--color-engrave)";

  return (
    <div ref={ref} className="relative px-2 pb-3">
      {open && (
        <div
          role="dialog"
          aria-label={`Crew: ${active.name}`}
          className="absolute bottom-full left-2 z-30 mb-2 max-h-[70vh] w-[380px] overflow-y-auto rounded-lg border border-rule-strong bg-panel p-4 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)]"
        >
          <div className="mb-3 flex items-center">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">Your crew</span>
            <button onClick={() => setOpen(false)} aria-label="Close crew menu" className="ml-auto rounded p-0.5 text-engrave hover:bg-rule hover:text-cream">
              <X size={14} />
            </button>
          </div>
          <CrewHome />
          <button
            onClick={() => {
              setOpen(false);
              setPipelineBoard("crew");
              setView("pipeline");
            }}
            className="mt-3 text-xs text-engrave underline hover:text-cream"
          >
            Open the crew board
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left ${open ? "border-rule-strong bg-raised" : "border-rule hover:bg-raised"}`}
      >
        <Users size={15} className="shrink-0 text-body" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-cream">{active.name}</span>
          <span className="block text-[11px] text-engrave">
            {active.role === "owner" ? "Owner" : "Member"}
            {/* You're always a member: 0 means the list hasn't loaded yet. */}
            {members > 0 && ` · ${members} member${members === 1 ? "" : "s"}`}
          </span>
        </span>
        <StatusDot color={light} size={7} />
        <ChevronUp size={13} className={`shrink-0 text-engrave transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
    </div>
  );
}
