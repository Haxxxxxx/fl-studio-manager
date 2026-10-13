import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Disc3,
  FolderInput,
  FolderSearch,
  Music2,
  PlayCircle,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatRelative } from "../lib/format";
import { openInFlStudio } from "../lib/tauri";
import {
  STATUSES,
  isFinished,
  UNSORTED,
  backupsBytes,
  hasProblems,
  renderFreshness,
  songLabel,
  rendersBytes,
  saveTimestamps,
  statusInfo,
} from "../lib/songs";
import { EmptyLibrary, useVisibleSongs } from "./LibraryView";
import { CrewCards } from "./CrewCards";
import { useCrewStore } from "../store/useCrewStore";
import { crewStats, RECENT_DAYS } from "../lib/crewStats";
import { STALLED_DAYS } from "../lib/crew";
import { pathsByShareId } from "../lib/crewSync";
import { ProgressBar } from "./AlbumsView";
import { StatusDot, btn, btnPrimary } from "./ui";
import { Card, HeroStat, SongLines, StatTile } from "../ui";

// Charts stay neutral (cream → grey, plus one amber) so blue keeps meaning
// "stage" and orange "needs you". Storage is part-to-whole over four
// categories in fixed order, backed by direct labels in the legend.
const STORAGE_COLORS = ["#f2efe8", "#8d897f", "#5a5850", "#c98500"];
const SERIES_1 = "#c9c5bb";
const AXIS_COLOR = "#8d897f";
const GRID_COLOR = "#2c2b27";
// Activity heatmap: one hue (the app accent), stepped by opacity over the surface.
const HEAT = ["#1f1f1c", "rgba(255,90,31,0.32)", "rgba(255,90,31,0.55)", "rgba(255,90,31,0.8)", "#ff5a1f"];

const DAY = 24 * 60 * 60 * 1000;
const HEATMAP_WEEKS = 53;

function MyDashboard() {
  const songs = useVisibleSongs();
  const workspace = useAppStore((s) => s.workspace);
  const demoMode = useAppStore((s) => s.demoMode);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const exitDemoMode = useAppStore((s) => s.exitDemoMode);
  const setView = useAppStore((s) => s.setView);
  const openDetail = useAppStore((s) => s.openDetail);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const watchedFolders = useAppStore((s) => s.settings.watchedFolders);
  const scanning = useAppStore((s) => s.scanning);

  const statusOf = (path: string) => workspace.songs[path]?.status;

  const pipeline = useMemo(
    () =>
      [{ id: undefined, ...UNSORTED }, ...STATUSES].map((s) => ({
        ...s,
        count: songs.filter((p) => statusOf(p.path) === s.id).length,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, workspace.songs],
  );

  const inProgress = songs.filter((p) => {
    const s = statusOf(p.path);
    return s && !isFinished(s);
  }).length;
  const finished = pipeline.filter((s) => isFinished(s.id)).reduce((t, s) => t + s.count, 0);

  const continueWith = useMemo(
    () => songs.filter((p) => !isFinished(statusOf(p.path))).slice(0, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, workspace.songs],
  );

  const outdated = useMemo(() => songs.filter((p) => renderFreshness(p) === "stale"), [songs]);
  const doneNoMix = useMemo(
    () => songs.filter((p) => isFinished(statusOf(p.path)) && renderFreshness(p) === "none"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs, workspace.songs],
  );

  const storage = useMemo(() => {
    const sum = (f: (p: (typeof songs)[number]) => number) => songs.reduce((t, p) => t + f(p), 0);
    return [
      { label: "Project files", bytes: sum((p) => p.sizeBytes) },
      { label: "Backups", bytes: sum(backupsBytes) },
      { label: "Recordings", bytes: sum((p) => p.recordingsBytes) },
      { label: "Mixdowns", bytes: sum(rendersBytes) },
    ];
  }, [songs]);
  const storageTotal = storage.reduce((t, s) => t + s.bytes, 0);

  const tempo = useMemo(() => {
    const bins = new Map<number, number>();
    for (const p of songs) {
      if (p.tempoBpm == null) continue;
      const bin = Math.floor(p.tempoBpm / 10) * 10;
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }
    if (bins.size === 0) return [];
    const lo = Math.min(...bins.keys());
    const hi = Math.max(...bins.keys());
    const out = [];
    for (let b = lo; b <= hi; b += 10) out.push({ label: `${b}–${b + 9}`, count: bins.get(b) ?? 0 });
    return out;
  }, [songs]);

  if (songs.length === 0) {
    if (!demoMode && watchedFolders.length === 0) return <EmptyLibrary />;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised text-engrave">
          <FolderSearch size={28} />
        </div>
        <div className="text-base font-medium text-cream">{scanning ? "Scanning your projects…" : "No songs found yet"}</div>
        {!scanning && (
          <>
            <div className="max-w-sm text-sm text-engrave">
              No projects in your linked folders. Check the folders in Settings, or load sample data to look around.
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setView("settings")} className={btnPrimary}>
                Open Settings
              </button>
              <button onClick={loadDemoData} className={btn}>
                Load sample data
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        {demoMode && (
          <div className="flex items-center justify-between rounded-md border border-orange-400/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-200">
            <span>Showing sample data — link a real folder anytime.</span>
            <button onClick={exitDemoMode} className="rounded border border-orange-400/40 px-2.5 py-1 text-xs font-medium hover:bg-orange-500/20">
              Exit demo
            </button>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <StatTile icon={<Music2 size={15} />} label="Songs" value={songs.length} />
          <StatTile icon={<Sparkles size={15} />} label="In progress" value={inProgress} />
          <StatTile icon={<Trophy size={15} />} label="Finished" value={finished} />
          <StatTile icon={<Disc3 size={15} />} label="Releases" value={workspace.albums.length} />
        </div>

        <Card title="Pick up where you left off">
          <div className="grid grid-cols-4 gap-2">
            {continueWith.map((p) => {
              const s = statusInfo(statusOf(p.path));
              return (
                <div
                  key={p.path}
                  onClick={() => openDetail(p.path)}
                  className="group cursor-pointer rounded-lg border border-rule bg-raised p-3 hover:border-rule-strong"
                >
                  <div className="truncate text-sm font-medium text-cream">{p.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-body">
                    <StatusDot color={s.color} size={6} /> {s.label}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-engrave">
                    <span>{formatRelative(p.modifiedAtMs)}</span>
                    {!demoMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openInFlStudio(p.path).catch((err) => console.error("couldn't open the project", err));
                        }}
                        className="flex items-center gap-1 text-engrave opacity-0 hover:text-orange-300 group-hover:opacity-100"
                      >
                        <PlayCircle size={13} /> Open
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <CrewCards songs={songs} />

        <Card title={`Studio activity — saves per day, last 12 months`}>
          <ActivityHeatmap />
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card title="Pipeline">
            <div className="flex flex-col gap-1.5">
              {pipeline.map((s) => {
                const max = Math.max(1, ...pipeline.map((x) => x.count));
                return (
                  <button
                    key={s.label}
                    onClick={() => {
                      setStatusFilter(s.id ?? "unsorted");
                      setView("library");
                    }}
                    className="group flex items-center gap-3 rounded px-1 py-0.5 text-left hover:bg-panel"
                  >
                    <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-body">
                      <StatusDot color={s.color} /> {s.label}
                    </span>
                    <span className="flex h-4 flex-1 items-center">
                      <span
                        className="h-full rounded-r"
                        style={{ width: `${(s.count / max) * 100}%`, minWidth: s.count ? 3 : 0, background: s.color }}
                      />
                    </span>
                    <span className="w-8 text-right text-xs tabular-nums text-body">{s.count}</span>
                  </button>
                );
              })}
            </div>
            {pipeline[0].count === songs.length && (
              <div className="mt-3 text-xs text-engrave">
                Nothing triaged yet — open the Pipeline board and drag songs into stages.
              </div>
            )}
          </Card>

          <Card title="Tempo — songs per 10 BPM">
            {tempo.length ? (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={tempo} margin={{ left: -18, right: 4, top: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                  <XAxis dataKey="label" tick={{ fill: AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<TempoTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="count" fill={SERIES_1} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-10 text-center text-xs text-engrave">No tempo data</div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card title="Plugin toolkit — songs using each">
            <PluginToolkit />
          </Card>
          <Card title="Will this computer open your songs?">
            <HealthCard />
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card title={`Storage — ${formatBytes(storageTotal)}`}>
            <div className="flex h-4 gap-[2px]">
              {storage.map((s, i) =>
                s.bytes ? (
                  <div
                    key={s.label}
                    title={`${s.label}: ${formatBytes(s.bytes)}`}
                    style={{ flexGrow: s.bytes, background: STORAGE_COLORS[i], minWidth: 3 }}
                    className="first:rounded-l last:rounded-r"
                  />
                ) : null,
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {storage.map((s, i) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STORAGE_COLORS[i] }} />
                  <span className="flex-1 text-body">{s.label}</span>
                  <span className="tabular-nums text-cream">{formatBytes(s.bytes)}</span>
                </div>
              ))}
            </div>
            <BackupHogs />
          </Card>

          <Card title="Needs attention">
            <AttentionList
              icon={<AlertTriangle size={13} className="text-amber-400" />}
              title={`${outdated.length} mixdown${outdated.length === 1 ? "" : "s"} older than the project`}
              items={outdated}
            />
            <AttentionList
              icon={<Disc3 size={13} className="text-engrave" />}
              title={`${doneNoMix.length} finished song${doneNoMix.length === 1 ? "" : "s"} without a mixdown`}
              items={doneNoMix}
            />
            {outdated.length === 0 && doneNoMix.length === 0 && (
              <div className="text-xs text-engrave">All mixdowns are current.</div>
            )}
          </Card>
        </div>

        <PitchesCard />

        {workspace.albums.length > 0 && (
          <Card title="Releases">
            <div className="flex flex-col gap-3">
              {workspace.albums.map((a) => {
                const done = a.trackPaths.filter((p) => isFinished(statusOf(p))).length;
                return (
                  <button key={a.id} onClick={() => openAlbum(a.id)} className="flex items-center gap-3 text-left">
                    <span className="h-8 w-8 shrink-0 rounded" style={{ background: a.color }} />
                    <span className="w-40 shrink-0">
                      <span className="block truncate text-sm text-cream">{a.title}</span>
                      <span className="block text-[11px] text-engrave">
                        {done}/{a.trackPaths.length} done
                        {a.releaseDate && ` · ${formatRelative(new Date(a.releaseDate).getTime())}`}
                      </span>
                    </span>
                    <span className="flex-1">
                      <ProgressBar trackPaths={a.trackPaths} workspace={workspace} height={8} />
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  function AttentionList({ icon, title, items }: { icon: React.ReactNode; title: string; items: typeof songs }) {
    if (!items.length) return null;
    return (
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-xs text-body">
          {icon} {title}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {items.slice(0, 8).map((p) => (
            <button
              key={p.path}
              title={p.path}
              onClick={() => openDetail(p.path)}
              className="rounded bg-raised px-2 py-0.5 text-[11px] text-body hover:bg-rule hover:text-cream"
            >
              {songLabel(p, songs)}
            </button>
          ))}
          {items.length > 8 && <span className="px-1 text-[11px] text-engrave">+{items.length - 8}</span>}
        </div>
      </div>
    );
  }

  function BackupHogs() {
    const top = [...songs].sort((a, b) => backupsBytes(b) - backupsBytes(a)).slice(0, 3).filter((p) => p.backups.length > 5);
    if (!top.length) return null;
    return (
      <div className="mt-4 border-t border-rule pt-3 text-xs">
        <div className="text-body">Most backups — clean up from the song's Versions panel</div>
        {top.map((p) => (
          <button key={p.path} onClick={() => openDetail(p.path)} className="mt-1 flex w-full items-center gap-2 text-left hover:text-cream">
            <span className="flex-1 truncate text-body">{p.name}</span>
            <span className="text-engrave">{p.backups.length} files</span>
            <span className="w-16 text-right tabular-nums text-body">{formatBytes(backupsBytes(p))}</span>
          </button>
        ))}
      </div>
    );
  }
}

/** GitHub-style calendar: every save (current file + each backup) is a
 * real work session, so this shows when you actually made music. */
function ActivityHeatmap() {
  const songs = useVisibleSongs();
  const openDetail = useAppStore((s) => s.openDetail);
  const [hover, setHover] = useState<{ day: number; x: number; y: number } | null>(null);

  const lastSave = useMemo(() => Math.max(0, ...songs.map((p) => p.modifiedAtMs)), [songs]);
  const { days, max, activeDays, streak, longest, busiest, months } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Grid starts on the Monday HEATMAP_WEEKS weeks back.
    const start = new Date(today);
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (HEATMAP_WEEKS - 1) * 7);
    // Calendar days, not 24h steps: a DST change makes one day 23 or 25h
    // long, which would shift every later cell's date (or drop today).
    const dayIndex = (d: Date) =>
      Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
        Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / DAY);
    const total = dayIndex(today) + 1;
    const days = Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: d, saves: 0, songs: new Set<string>() };
    });
    for (const p of songs) {
      for (const t of saveTimestamps(p)) {
        const idx = dayIndex(new Date(t));
        if (idx >= 0 && idx < total) {
          days[idx].saves += 1;
          days[idx].songs.add(p.name);
        }
      }
    }
    // Today doesn't break the streak until it's over.
    let streak = 0;
    for (let i = days[total - 1].saves ? total - 1 : total - 2; i >= 0 && days[i].saves > 0; i--) streak++;
    let longest = 0;
    let run = 0;
    for (const d of days) {
      run = d.saves ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    const busiest = days.reduce((a, b) => (b.saves > a.saves ? b : a), days[0]);
    // Month label over the first column containing the 1st of that month.
    const months: (string | null)[] = Array.from({ length: Math.ceil(total / 7) }, (_, w) => {
      const firstOfMonth = days.slice(w * 7, w * 7 + 7).find((d) => d.date.getDate() === 1);
      return firstOfMonth ? firstOfMonth.date.toLocaleDateString(undefined, { month: "short" }) : null;
    });
    return {
      days,
      max: Math.max(1, ...days.map((d) => d.saves)),
      activeDays: days.filter((d) => d.saves > 0).length,
      streak,
      longest,
      busiest,
      months,
    };
  }, [songs]);

  const level = (n: number) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor(((n - 1) / max) * 4)));
  const weeks = Math.ceil(days.length / 7);
  const hovered = hover ? days[hover.day] : null;

  return (
    <div className="relative">
      <div className="flex gap-4">
        <div className="flex gap-[2px] overflow-x-auto pb-1">
          <div className="mr-1 flex flex-col gap-[2px] pt-[15px] text-[9px] leading-[11px] text-engrave">
            {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
              <span key={i} className="h-[11px]">{d}</span>
            ))}
          </div>
          {Array.from({ length: weeks }, (_, w) => (
            <div key={w} className="flex flex-col gap-[2px]">
              <span className="h-[13px] w-[11px] overflow-visible whitespace-nowrap text-[9px] leading-[11px] text-engrave">
                {months[w]}
              </span>
              {days.slice(w * 7, w * 7 + 7).map((d, i) => (
                <div
                  key={d.date.getTime()}
                  onMouseEnter={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const parent = e.currentTarget.closest(".relative")!.getBoundingClientRect();
                    setHover({ day: w * 7 + i, x: r.left - parent.left + r.width / 2, y: r.top - parent.top });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    const name = [...d.songs][0];
                    const p = songs.find((s) => s.name === name);
                    if (p) openDetail(p.path);
                  }}
                  className={`h-[11px] w-[11px] rounded-[2px] ${d.saves ? "cursor-pointer" : ""} ${hover?.day === w * 7 + i ? "ring-1 ring-cream" : ""}`}
                  style={{ background: HEAT[level(d.saves)] }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex shrink-0 flex-col justify-center gap-2 text-xs">
          <HeroStat label="Active days" value={activeDays} />
          {streak > 0 ? (
            <HeroStat label="Current streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
          ) : (
            lastSave > 0 && <HeroStat label="Last session" value={formatRelative(lastSave)} />
          )}
          {longest > 1 && <HeroStat label="Longest streak" value={`${longest} days`} />}
          {busiest.saves > 0 && (
            <div className="text-[11px] text-engrave">
              Busiest: {busiest.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {busiest.saves} saves
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-engrave">
        Less
        {HEAT.map((c) => (
          <span key={c} className="h-[10px] w-[10px] rounded-[2px]" style={{ background: c }} />
        ))}
        More
      </div>
      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-rule bg-chassis px-2.5 py-1.5 text-[11px] shadow-xl"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <div className="text-engrave">
            {hovered.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </div>
          <div className="font-medium text-cream">
            {hovered.saves} save{hovered.saves === 1 ? "" : "s"}
          </div>
          {hovered.songs.size > 0 && (
            <div className="max-w-[200px] truncate text-body">{[...hovered.songs].join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}

const CRITICAL = "#ff4040";
const FOLLOW_UP_DAYS = 14;

/** Beats sent with no answer for two weeks, and recent wins. */
function PitchesCard() {
  const songsMeta = useAppStore((s) => s.workspace.songs);
  const people = useAppStore((s) => s.workspace.people);
  const projects = useAppStore((s) => s.projects);
  const openDetail = useAppStore((s) => s.openDetail);

  const { followUps, wins, total } = useMemo(() => {
    const names = new Map(people.map((p) => [p.id, p.name]));
    const songNames = new Map(projects.map((p) => [p.path, p.name]));
    const cutoff = new Date(Date.now() - FOLLOW_UP_DAYS * DAY).toISOString().slice(0, 10);
    const all = Object.entries(songsMeta).flatMap(([path, meta]) =>
      (meta.pitches ?? []).map((pitch) => ({
        path,
        pitch,
        song: songNames.get(path) ?? path.split(/[/\\]/).pop() ?? path,
        who: names.get(pitch.personId) ?? "Unknown",
      })),
    );
    return {
      total: all.length,
      followUps: all
        .filter((x) => (x.pitch.outcome === "sent" || x.pitch.outcome === "listened") && x.pitch.date <= cutoff)
        .sort((a, b) => a.pitch.date.localeCompare(b.pitch.date)),
      wins: all
        .filter((x) => x.pitch.outcome === "placed" || x.pitch.outcome === "sold")
        .sort((a, b) => b.pitch.date.localeCompare(a.pitch.date)),
    };
  }, [songsMeta, people, projects]);

  if (total === 0) return null;
  const Row = ({ x, right }: { x: (typeof followUps)[number]; right: string }) => (
    <button onClick={() => openDetail(x.path)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-panel">
      <span className="min-w-0 flex-1 truncate text-cream">{x.song}</span>
      <span className="w-32 truncate text-engrave">→ {x.who}</span>
      <span className="w-24 text-right text-engrave">{right}</span>
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card title={`Follow up — no answer after ${FOLLOW_UP_DAYS} days`}>
        {followUps.length === 0 ? (
          <div className="text-xs text-engrave">Nothing waiting.</div>
        ) : (
          followUps.slice(0, 6).map((x) => <Row key={x.pitch.id} x={x} right={formatRelative(new Date(x.pitch.date).getTime())} />)
        )}
      </Card>
      <Card title={`Wins — placed or sold · ${wins.length}`}>
        {wins.length === 0 ? (
          <div className="text-xs text-engrave">None logged yet. {total} send{total === 1 ? "" : "s"} tracked.</div>
        ) : (
          wins.slice(0, 6).map((x) => <Row key={x.pitch.id} x={x} right={x.pitch.outcome === "sold" ? "Sold" : "Placed"} />)
        )}
      </Card>
    </div>
  );
}

function usePluginStats() {
  const songs = useVisibleSongs();
  return useMemo(() => {
    // count = songs using it; missingCount = songs where it didn't resolve
    // (can differ per song: projects store different plugin paths).
    const stats = new Map<string, { name: string; count: number; missingCount: number; thirdParty: boolean; missing: boolean }>();
    for (const p of songs) {
      for (const plugin of p.plugins) {
        const s = stats.get(plugin.name) ?? { name: plugin.name, count: 0, missingCount: 0, thirdParty: plugin.installed !== null, missing: false };
        s.count += 1;
        if (plugin.installed === false) {
          s.missing = true;
          s.missingCount += 1;
        }
        stats.set(plugin.name, s);
      }
    }
    return [...stats.values()].sort((a, b) => b.count - a.count);
  }, [songs]);
}

function useShowSongsWithPlugin() {
  const setView = useAppStore((s) => s.setView);
  const setPluginFilter = useAppStore((s) => s.setPluginFilter);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  return (name: string) => {
    setStatusFilter(null);
    setPluginFilter(name);
    setView("library");
  };
}

function PluginToolkit() {
  const stats = usePluginStats();
  const showSongs = useShowSongsWithPlugin();
  const [thirdPartyOnly, setThirdPartyOnly] = useState(true);
  const list = stats.filter((s) => !thirdPartyOnly || s.thirdParty).slice(0, 10);
  const max = Math.max(1, ...list.map((s) => s.count));
  if (!stats.length) return <div className="py-6 text-center text-xs text-engrave">No plugin data</div>;
  return (
    <div>
      <div className="mb-2 flex gap-1 text-[11px]">
        {[
          [true, "Third-party"],
          [false, "All"],
        ].map(([value, label]) => (
          <button
            key={String(value)}
            onClick={() => setThirdPartyOnly(value as boolean)}
            className={`rounded-full px-2 py-0.5 ${thirdPartyOnly === value ? "bg-rule-strong text-cream" : "text-body hover:bg-raised"}`}
          >
            {label as string}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {list.map((s) => (
          <button
            key={s.name}
            onClick={() => showSongs(s.name)}
            title={`Show the ${s.count} songs using ${s.name}`}
            className="group flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-panel"
          >
            <span className={`flex w-36 shrink-0 items-center gap-1 truncate text-xs ${s.missing ? "text-red-300" : "text-body"}`}>
              {s.missing && <AlertTriangle size={11} className="shrink-0" />}
              <span className="truncate">{s.name}</span>
            </span>
            <span className="flex h-3 flex-1 items-center">
              <span
                className="h-full rounded-r"
                style={{ width: `${(s.count / max) * 100}%`, minWidth: 3, background: s.missing ? CRITICAL : SERIES_1 }}
              />
            </span>
            <span className="w-6 text-right text-xs tabular-nums text-body">{s.count}</span>
          </button>
        ))}
      </div>
      {list.some((s) => s.missing) && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-engrave">
          <AlertTriangle size={10} className="text-red-300" /> Not installed on this computer
        </div>
      )}
    </div>
  );
}

function HealthCard() {
  const songs = useVisibleSongs();
  const stats = usePluginStats();
  const showSongs = useShowSongsWithPlugin();
  const setView = useAppStore((s) => s.setView);
  const setProblemsOnly = useAppStore((s) => s.setProblemsOnly);
  const missingPlugins = stats.filter((s) => s.missing);
  const samples = useMemo(() => {
    const c = { missing: 0, relocated: 0, songsMissing: 0 };
    for (const p of songs) {
      let m = 0;
      for (const s of p.samples) {
        if (s.status === "missing") m++;
        if (s.status === "relocated") c.relocated++;
      }
      c.missing += m;
      if (m) c.songsMissing++;
    }
    return c;
  }, [songs]);
  const affected = songs.filter(hasProblems).length;
  const clean = songs.length - affected;
  const pct = songs.length ? Math.floor((clean / songs.length) * 100) : 100;

  if (!affected && !samples.relocated) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold text-emerald-300">100%</span>
          <span className="text-xs text-engrave">of {songs.length} songs open cleanly on this computer</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 size={16} /> Every song has its plugins and samples.
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-semibold ${affected ? "text-cream" : "text-emerald-300"}`}>{pct}%</span>
        <span className="text-engrave">
          of {songs.length} songs open cleanly on this computer
        </span>
        {affected > 0 && (
          <button
            onClick={() => {
              setProblemsOnly(true);
              setView("library");
            }}
            className="ml-auto text-body hover:text-cream"
          >
            Show {affected} →
          </button>
        )}
      </div>
      <div className="flex h-2 gap-[2px]" title={`${clean} open cleanly · ${affected} missing plugins or samples`}>
        {clean > 0 && <div className="rounded-l bg-emerald-500/70 last:rounded-r" style={{ flexGrow: clean }} />}
        {affected > 0 && <div className="rounded-r first:rounded-l" style={{ flexGrow: affected, background: CRITICAL }} />}
      </div>
      {missingPlugins.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-body">
            <AlertTriangle size={12} className="text-red-400" /> Plugins not installed
          </div>
          <div className="flex flex-wrap gap-1">
            {missingPlugins.map((p) => (
              <button
                key={p.name}
                onClick={() => showSongs(p.name)}
                className="rounded bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200 hover:bg-red-500/20"
              >
                {p.name} · {p.missingCount} song{p.missingCount === 1 ? "" : "s"}
              </button>
            ))}
          </div>
        </div>
      )}
      {samples.missing > 0 && (
        <div className="flex items-center gap-1.5 text-body">
          <AlertTriangle size={12} className="text-red-400" />
          {samples.missing} sample{samples.missing === 1 ? "" : "s"} missing across {samples.songsMissing} song
          {samples.songsMissing === 1 ? "" : "s"}
        </div>
      )}
      {samples.relocated > 0 && (
        <div className="flex items-start gap-1.5 text-engrave">
          <FolderInput size={12} className="mt-px shrink-0 text-sky-400" />
          <span>
            {samples.relocated} samples aren't at their saved path but were found in the song's folder — the project
            was moved. The DAW usually finds these; re-saving the project there fixes the paths.
          </span>
        </div>
      )}
    </div>
  );
}

function TempoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-rule bg-chassis px-3 py-2 text-xs shadow-xl">
      <div className="text-engrave">{label} BPM</div>
      <div className="mt-0.5 font-medium text-cream">
        {payload[0].value} song{payload[0].value === 1 ? "" : "s"}
      </div>
    </div>
  );
}

type Scope = "me" | "crew";

/** "Me" = this computer's songs and studio habits. "Crew" = group stats from
 * shared songs only (roadmap 1a). The switch appears once you're in a crew. */
export function Dashboard() {
  const inCrew = useCrewStore((s) => s.enabled && !!s.userId && !!s.activeCrewId);
  const crewName = useCrewStore((s) => s.crews.find((c) => c.id === s.activeCrewId)?.name ?? "Crew");
  const hasLocal = useAppStore((s) => s.projects.length > 0 || s.settings.watchedFolders.length > 0);
  const [picked, setPicked] = useState<Scope | null>(null);
  // Members with no FL folders of their own land on the crew view.
  const scope: Scope = inCrew ? (picked ?? (hasLocal ? "me" : "crew")) : "me";

  if (!inCrew) return <MyDashboard />;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex justify-center border-b border-rule px-8 pb-2 pt-4">
        <div role="tablist" aria-label="Dashboard scope" className="flex rounded-md border border-rule p-0.5 text-xs">
          {(["me", "crew"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              onClick={() => setPicked(s)}
              className={`rounded px-3 py-1 ${scope === s ? "bg-rule text-cream" : "text-engrave hover:text-cream"}`}
            >
              {s === "me" ? "Me" : crewName}
            </button>
          ))}
        </div>
      </div>
      {scope === "me" ? <MyDashboard /> : <CrewDashboard />}
    </div>
  );
}

function CrewDashboard() {
  const songs = useCrewStore((s) => s.songs);
  const members = useCrewStore((s) => s.members);
  const userId = useCrewStore((s) => s.userId);
  const workspace = useAppStore((s) => s.workspace);
  const openDetail = useAppStore((s) => s.openDetail);
  const setView = useAppStore((s) => s.setView);
  const setPipelineBoard = useAppStore((s) => s.setPipelineBoard);
  const stats = useMemo(() => crewStats(songs, members), [songs, members]);
  const localPath = useMemo(() => pathsByShareId(workspace), [workspace]);
  // Your own shared songs open their panel; others' songs open the crew board.
  const open = (id: string) => {
    const path = localPath.get(id);
    if (path) openDetail(path);
    else {
      setPipelineBoard("crew");
      setView("pipeline");
    }
  };
  const who = (id: string, name: string) => (id === userId ? "You" : name);

  if (songs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-body">
        No crew stats yet: nothing is shared. Share songs from their panel or the Library, and ask the crew to do the same.
      </div>
    );
  }

  const max = Math.max(1, ...stats.byStage.map((s) => s.count));
  return (
    <div className="min-w-0 flex-1 overflow-auto px-8 py-7">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="grid grid-cols-4 gap-3">
          <StatTile icon={<Music2 size={15} />} label="Shared songs" value={stats.total} />
          <StatTile icon={<Sparkles size={15} />} label="In progress" value={stats.inProgress} />
          <StatTile icon={<Trophy size={15} />} label="Finished" value={stats.finished} />
          <StatTile icon={<PlayCircle size={15} />} label={`Moved · ${RECENT_DAYS} days`} value={stats.movedRecently} />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <Card title="Crew pipeline">
            <div className="flex flex-col gap-2">
              {stats.byStage.map((s) => {
                const info = statusInfo(s.id ?? undefined);
                return (
                  <div key={s.id ?? "none"} className="flex items-center gap-3 text-xs">
                    <span className="flex w-24 items-center gap-2 text-body">
                      <StatusDot color={info.color} /> {info.label}
                    </span>
                    <div className="h-2 flex-1 rounded bg-raised">
                      <div className="h-2 rounded" style={{ width: `${(s.count / max) * 100}%`, background: info.color }} />
                    </div>
                    <span className="w-6 text-right tabular-nums text-body">{s.count}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Who's on what">
            <div className="flex flex-col gap-2 text-xs">
              {stats.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-cream">{who(m.userId, m.name)}</span>
                  <span className="tabular-nums text-engrave" title="Shared songs · finished (Prep or later)">
                    {m.songs} song{m.songs === 1 ? "" : "s"} · {m.finished} done
                  </span>
                  <span className="w-20 text-right tabular-nums text-body" title={`Songs they last moved in the past ${RECENT_DAYS} days`}>
                    {m.recentMoves ? `${m.recentMoves} moved` : "—"}
                  </span>
                  <span className="w-24 text-right text-engrave">{m.lastActivityMs ? formatRelative(m.lastActivityMs) : "nothing shared"}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <Card title={`Ready to ship · ${stats.readyToShip.length}`}>
            {stats.readyToShip.length === 0 ? (
              <p className="text-xs text-body">Nothing in Prep with a mixdown and an accepted Launch Kit yet.</p>
            ) : (
              <SongLines items={stats.readyToShip.map((s) => ({ id: s.id, title: s.title, right: s.release_date ?? "no date" }))} onOpen={open} />
            )}
          </Card>
          <Card title="Coming out">
            {stats.upcoming.length === 0 ? (
              <p className="text-xs text-body">No release dates on shared songs. Set them in the Launch Kit.</p>
            ) : (
              <SongLines
                items={stats.upcoming.slice(0, 6).map((u) => ({ id: u.song.id, title: u.song.title, sub: who(u.song.owner_id, u.owner), right: u.date }))}
                onOpen={open}
              />
            )}
          </Card>
        </div>

        <Card title={`Stalled — no save or move in ${STALLED_DAYS}+ days`}>
          {stats.stalled.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-engrave">
              <CheckCircle2 size={13} className="text-emerald-400" /> Everything in Creation or Production moved recently.
            </p>
          ) : (
            <SongLines
              items={stats.stalled.map((x) => ({ id: x.song.id, title: x.song.title, sub: who(x.song.owner_id, x.owner), right: `${x.days} days` }))}
              onOpen={open}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
