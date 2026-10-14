import { useMemo } from "react";
import { AlertTriangle, CalendarDays, Hourglass, Users } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useInCrew } from "../store/useCrewStore";
import { buildCalendar } from "../lib/calendar";
import { crewActivity, stalledSongs, STALLED_DAYS } from "../lib/crew";
import { formatRelative } from "../lib/format";
import { STATUSES, UNSORTED, statusInfo } from "../lib/songs";
import type { ProjectInfo } from "../types";
import { StatusDot } from "./ui";

/** Dashboard row: next release, stalled tracks, and (in a crew) who's working on what. */
export function CrewCards({ songs }: { songs: ProjectInfo[] }) {
  const inCrew = useInCrew();
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const setView = useAppStore((s) => s.setView);
  const openDetail = useAppStore((s) => s.openDetail);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const openLaunchKit = useAppStore((s) => s.openLaunchKit);
  const openPerson = useAppStore((s) => s.openPerson);

  const next = useMemo(() => buildCalendar(projects, workspace).find((e) => e.daysAway >= 0), [projects, workspace]);
  const stalled = useMemo(() => stalledSongs(songs, workspace), [songs, workspace]);
  const crew = useMemo(() => crewActivity(workspace.people, songs, workspace), [songs, workspace]);

  return (
    <div className={`grid gap-4 ${inCrew ? "grid-cols-3" : "grid-cols-2"}`}>
      <Card icon={<CalendarDays size={13} />} title="Next release" action={{ label: "Calendar", run: () => setView("calendar") }}>
        {next ? (
          <button
            onClick={() => (next.source.type === "album" ? openAlbum(next.source.id) : openLaunchKit(next.source.path))}
            className="flex w-full flex-col gap-1.5 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: next.color }} />
              <span className="truncate text-sm font-medium text-cream">{next.title}</span>
            </div>
            <div className="font-display text-3xl leading-none text-cream">
              {next.daysAway === 0 ? "Today" : next.daysAway === 1 ? "Tomorrow" : formatRelative(next.dateMs)}
            </div>
            <div className="text-[11px] text-body">
              {new Date(next.dateMs).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              {next.tracks.length > 0 && ` · ${next.finished}/${next.tracks.length} finished · ${next.kitsAccepted}/${next.tracks.length} kits`}
            </div>
            {next.checks.find((c) => c.level === "warn") && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle size={11} className="mt-px shrink-0" /> {next.checks.find((c) => c.level === "warn")!.message}
              </div>
            )}
          </button>
        ) : (
          <div className="text-xs text-engrave">
            Nothing dated yet.{" "}
            <button onClick={() => setView("albums")} className="underline hover:text-cream">
              Plan a release
            </button>
          </div>
        )}
      </Card>

      <Card icon={<Hourglass size={13} />} title={`Stalled · no save in ${STALLED_DAYS}+ days`}>
        {stalled.length === 0 ? (
          <div className="text-xs text-engrave">Nothing stuck: every unfinished song was saved in the last {STALLED_DAYS} days.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {stalled.slice(0, 5).map((s) => (
              <button key={s.song.path} onClick={() => openDetail(s.song.path)} className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-panel">
                <StatusDot color={statusInfo(s.status).color} size={6} />
                <span className="min-w-0 flex-1 truncate text-cream">{s.song.name}</span>
                <span className="shrink-0 tabular-nums text-engrave">{s.idleDays}d</span>
              </button>
            ))}
            {stalled.length > 5 && <div className="px-1 text-[11px] text-engrave">+{stalled.length - 5} more</div>}
          </div>
        )}
      </Card>

      {inCrew && (
      <Card icon={<Users size={13} />} title="Crew · who's on what" action={{ label: "People", run: () => openPerson(null) }}>
        {crew.length === 0 ? (
          <div className="text-xs text-engrave">
            Add the crew in{" "}
            <button onClick={() => openPerson(null)} className="underline hover:text-cream">
              People
            </button>{" "}
            to see who's working on what. Names in mixer tracks are picked up automatically.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {crew.slice(0, 5).map((m) => (
              <button key={m.person.id} onClick={() => openPerson(m.person.id)} className="flex flex-col gap-1 rounded px-1 py-0.5 text-left hover:bg-panel">
                <div className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-cream">{m.person.name}</span>
                  <span className="shrink-0 text-body">
                    {m.active} active · {m.lastSessionMs ? formatRelative(m.lastSessionMs) : "no sessions"}
                  </span>
                </div>
                <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-raised" title="Their songs by stage">
                  {[{ id: "unsorted" as const, ...UNSORTED }, ...STATUSES].map((st) =>
                    m.byStage[st.id] ? <span key={st.id} style={{ flexGrow: m.byStage[st.id], background: st.color }} /> : null,
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: { label: string; run: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-rule bg-panel p-4">
      <div className="mb-3 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">
        {icon} {title}
        {action && (
          <button onClick={action.run} className="ml-auto font-display text-[13px] font-semibold tracking-[0.06em] text-body hover:text-cream">
            {action.label} →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
