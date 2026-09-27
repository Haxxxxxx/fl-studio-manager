import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FolderSearch, HardDrive, Music2, Star } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../lib/format";

// Dark-mode categorical slots, validated (validate_palette.js) against this
// app's #18181d card surface — see dataviz skill. Fixed order, never cycled.
const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
const OTHER_COLOR = "#5b5b63";
const AXIS_COLOR = "rgba(255,255,255,0.35)";
const GRID_COLOR = "rgba(255,255,255,0.08)";

function folderLabel(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function TooltipCard({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-white/10 bg-[#0f0f12] px-3 py-2 text-xs shadow-xl">
      <div className="text-white/50">{label}</div>
      <div className="mt-0.5 font-medium text-white">
        {payload[0].value} {payload[0].value === 1 ? "project" : "projects"}
      </div>
    </div>
  );
}

export function Dashboard() {
  const projects = useAppStore((s) => s.projects);
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const loadDemoData = useAppStore((s) => s.loadDemoData);
  const exitDemoMode = useAppStore((s) => s.exitDemoMode);
  const setView = useAppStore((s) => s.setView);

  const totalSize = useMemo(
    () => projects.reduce((sum, p) => sum + p.sizeBytes, 0),
    [projects],
  );

  const folderBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) {
      const label = folderLabel(p.root || p.folder);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([name, count]) => ({ name, count }));
    const rest = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0);
    if (rest > 0) top.push({ name: "Other", count: rest });
    return top;
  }, [projects]);

  const activity = useMemo(() => {
    const weeks = 10;
    const now = new Date();
    const buckets = Array.from({ length: weeks }, (_, i) => {
      const start = new Date(now);
      start.setDate(now.getDate() - (weeks - 1 - i) * 7);
      return { label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }), count: 0, startMs: start.getTime() - 7 * 24 * 60 * 60 * 1000 };
    });
    for (const p of projects) {
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (p.modifiedAtMs >= buckets[i].startMs) {
          buckets[i].count += 1;
          break;
        }
      }
    }
    return buckets;
  }, [projects]);

  const favoriteCount = settings.favorites.filter((f) =>
    projects.some((p) => p.path === f),
  ).length;

  const mostRecent = projects[0];

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-white/30">
          <FolderSearch size={28} />
        </div>
        <div className="text-base font-medium text-white/80">
          Nothing to show yet
        </div>
        <div className="max-w-sm text-sm text-white/40">
          Link a project folder in Settings, or load sample data to see how
          the dashboard and library look once populated.
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setView("settings")}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-400"
          >
            Link a project folder
          </button>
          <button
            onClick={loadDemoData}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
          >
            Load sample data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-8 py-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {demoMode && (
          <div className="flex items-center justify-between rounded-md border border-orange-400/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-200">
            <span>Showing sample data — link a real folder anytime.</span>
            <button
              onClick={exitDemoMode}
              className="rounded border border-orange-400/40 px-2.5 py-1 text-xs font-medium hover:bg-orange-500/20"
            >
              Exit demo
            </button>
          </div>
        )}

        <div className="grid grid-cols-4 gap-3">
          <StatTile
            icon={<Music2 size={16} />}
            label="Projects"
            value={String(projects.length)}
          />
          <StatTile
            icon={<HardDrive size={16} />}
            label="Total size"
            value={formatBytes(totalSize)}
          />
          <StatTile
            icon={<FolderSearch size={16} />}
            label="Folders linked"
            value={String(settings.watchedFolders.length || new Set(projects.map((p) => p.root)).size)}
          />
          <StatTile
            icon={<Star size={16} />}
            label="Favorites"
            value={String(favoriteCount)}
          />
        </div>

        {mostRecent && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
            Most recently touched:{" "}
            <span className="font-medium text-white/90">{mostRecent.name}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Projects by folder">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={folderBreakdown} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
                <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip content={<TooltipCard />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                  {folderBreakdown.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={entry.name === "Other" ? OTHER_COLOR : SERIES[i % SERIES.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Activity — last 10 weeks">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activity} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: AXIS_COLOR, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                <Tooltip content={<TooltipCard />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={SERIES[0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-1.5 text-white/40">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1.5 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">
        {title}
      </div>
      {children}
    </div>
  );
}
