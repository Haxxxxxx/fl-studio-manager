import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Info, Plus } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { buildCalendar, monthLabel, type CalendarEntry } from "../lib/calendar";
import { formatRelative } from "../lib/format";
import { btn, btnPrimary } from "./ui";
import { Meter } from "../ui";

const KIND_LABEL = { album: "Album", ep: "EP", single: "Single", mixtape: "Mixtape" } as const;

/** Planned and past releases, with how ready each one is. */
export function CalendarView() {
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const openLaunchKit = useAppStore((s) => s.openLaunchKit);
  const setView = useAppStore((s) => s.setView);
  const [showAllPast, setShowAllPast] = useState(false);

  const entries = useMemo(() => buildCalendar(projects, workspace), [projects, workspace]);
  const upcoming = entries.filter((e) => e.daysAway >= 0);
  const past = entries.filter((e) => e.daysAway < 0).reverse();
  const months = useMemo(() => {
    const groups: { label: string; items: CalendarEntry[] }[] = [];
    for (const e of upcoming) {
      const label = monthLabel(e.dateMs);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(e);
      else groups.push({ label, items: [e] });
    }
    return groups;
  }, [upcoming]);

  const open = (e: CalendarEntry) => (e.source.type === "album" ? openAlbum(e.source.id) : openLaunchKit(e.source.path));

  return (
    <div className="min-w-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <CalendarDays size={18} className="text-orange-300" />
          <div>
            <h1 className="text-lg font-semibold text-white">Release calendar</h1>
            <p className="text-xs text-white/40">Dates from your releases and from songs' Launch Kits.</p>
          </div>
          <button onClick={() => setView("albums")} className={`${btn} ml-auto`}>
            <Plus size={14} /> Plan a release
          </button>
        </header>

        {entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
            <CalendarDays size={28} className="text-white/25" />
            <div className="text-sm font-medium text-white/80">No release dates yet</div>
            <div className="max-w-sm text-xs text-white/45">
              Give a release a date in Releases, or set a release date in a song's Launch Kit. It shows up here with how ready it is.
            </div>
            <button onClick={() => setView("albums")} className={btnPrimary}>
              Plan a release
            </button>
          </div>
        )}

        {upcoming.length === 0 && entries.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/50">Nothing planned. The last release was {formatRelative(past[0].dateMs)}.</div>
        )}

        {months.map((m) => (
          <section key={m.label} className="flex flex-col gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-white/40">{m.label}</h2>
            {m.items.map((e) => (
              <Row key={e.key} entry={e} onOpen={() => open(e)} />
            ))}
          </section>
        ))}

        {past.length > 0 && (
          <section className="flex flex-col gap-2 border-t border-white/5 pt-5">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-white/40">Released · {past.length}</h2>
            {(showAllPast ? past : past.slice(0, 5)).map((e) => (
              <Row key={e.key} entry={e} onOpen={() => open(e)} past />
            ))}
            {past.length > 5 && (
              <button onClick={() => setShowAllPast((v) => !v)} className="flex items-center gap-1 self-start text-xs text-white/45 hover:text-white">
                <ChevronDown size={13} className={showAllPast ? "rotate-180" : ""} /> {showAllPast ? "Show fewer" : `Show all ${past.length}`}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ entry: e, onOpen, past = false }: { entry: CalendarEntry; onOpen: () => void; past?: boolean }) {
  const d = new Date(e.dateMs);
  const total = e.tracks.length;
  const countdown = e.daysAway === 0 ? "Today" : e.daysAway === 1 ? "Tomorrow" : formatRelative(e.dateMs);
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-start gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left hover:border-white/20 hover:bg-white/[0.05] ${past ? "opacity-70" : ""}`}
    >
      <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-white/5 py-1.5">
        <span className="text-[10px] uppercase tracking-wide text-white/45">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <span className="text-xl font-semibold leading-tight text-white">{d.getDate()}</span>
        <span className="text-[10px] uppercase text-white/45">{d.toLocaleDateString(undefined, { month: "short" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.color }} />
          <span className="truncate text-sm font-medium text-white/90">{e.title}</span>
          <span className="shrink-0 rounded bg-white/10 px-1.5 py-px text-[10px] text-white/60">{KIND_LABEL[e.kind]}</span>
          <span className={`ml-auto shrink-0 text-xs ${e.daysAway >= 0 && e.daysAway < 7 ? "text-orange-300" : "text-white/45"}`}>{countdown}</span>
        </div>
        <div className="mt-1 truncate text-[11px] text-white/40">
          {total} track{total === 1 ? "" : "s"}
          {total > 0 && total <= 4 && ` · ${e.tracks.map((t) => t.name).join(", ")}`}
        </div>
        {total > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-3 text-[11px]">
            <Meter label="Finished (Prep or later)" value={e.finished} total={total} />
            <Meter label="Launch Kit accepted" value={e.kitsAccepted} total={total} />
          </div>
        )}
        {e.checks.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {e.checks.map((c) => (
              <div key={c.message} className={`flex items-start gap-1.5 text-[11px] ${c.level === "warn" ? "text-amber-300" : "text-white/45"}`}>
                {c.level === "warn" ? <AlertTriangle size={11} className="mt-px shrink-0" /> : <Info size={11} className="mt-px shrink-0" />}
                {c.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
