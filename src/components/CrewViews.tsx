import type { ReactNode } from "react";
import { useCrewStore, useInCrew } from "../store/useCrewStore";
import { PipelinePage } from "./pipeline/PipelinePage";
import { useCrewSource } from "./pipeline/crew";
import { CrewAccount, CrewInvites, CrewMembers, CrewStatus } from "./CrewPanel";
import { releaseTracks, sortCrewReleases } from "../lib/crewSync";
import { formatRelative } from "../lib/format";
import { isFinished, statusInfo } from "../lib/songs";
import { localDay } from "../lib/crewStats";
import { StatusDot } from "./ui";

// The crew pages behind the sidebar's crew section. The board is for every
// member; members & invites and crew settings are the owner's.

function Page({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-rule px-6 py-3">
        <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-cream">{title}</h1>
        {sub && <p className="mt-1 text-xs text-engrave">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function useCrewName() {
  return useCrewStore((s) => s.crews.find((c) => c.id === s.activeCrewId)?.name ?? null);
}

export function useIsCrewOwner(): boolean {
  return useCrewStore((s) => s.crews.find((c) => c.id === s.activeCrewId)?.role === "owner");
}

function NotInCrew() {
  return <div className="p-6 text-sm text-engrave">You're not in a crew. Sign in and join one in Settings → Crew.</div>;
}

function OwnerOnly() {
  return <div className="p-6 text-sm text-engrave">Only the crew's owner manages this.</div>;
}

/** The crew's pipeline: the same board / list / table as yours, over the
 * crew's songs and columns. The owner edits columns; anyone moves cards. */
export function CrewBoardView() {
  const inCrew = useInCrew();
  const owner = useIsCrewOwner();
  const name = useCrewName();
  const source = useCrewSource();
  if (!inCrew) {
    return (
      <Page title="Crew board">
        <NotInCrew />
      </Page>
    );
  }
  const sub = `${name ?? "Crew"} · anyone in the crew can move a card${owner ? " · you edit the columns" : ""}`;
  return <PipelinePage title="Crew board" sub={sub} source={source} />;
}

export function CrewMembersView() {
  const inCrew = useInCrew();
  const owner = useIsCrewOwner();
  const name = useCrewName();
  return (
    <Page title="Members & invites" sub={name ?? undefined}>
      {!inCrew ? (
        <NotInCrew />
      ) : !owner ? (
        <OwnerOnly />
      ) : (
        <div className="flex max-w-3xl flex-col gap-6 overflow-y-auto p-6">
          <CrewMembers />
          <CrewInvites />
        </div>
      )}
    </Page>
  );
}

export function CrewSettingsView() {
  const inCrew = useInCrew();
  const owner = useIsCrewOwner();
  const name = useCrewName();
  return (
    <Page title="Crew settings" sub={name ?? undefined}>
      {!inCrew ? (
        <NotInCrew />
      ) : !owner ? (
        <OwnerOnly />
      ) : (
        <div className="flex max-w-3xl flex-col gap-6 overflow-y-auto p-6">
          <CrewStatus />
          <CrewAccount />
        </div>
      )}
    </Page>
  );
}

const KIND_LABEL: Record<string, string> = { album: "Album", ep: "EP", single: "Single", mixtape: "Mixtape" };

/** Releases the crew shares: everyone sees them, only their owner edits them (in the app's Releases). */
export function CrewReleasesView() {
  const inCrew = useInCrew();
  const name = useCrewName();
  const releases = useCrewStore((s) => s.releases);
  const songs = useCrewStore((s) => s.songs);
  const members = useCrewStore((s) => s.members);
  const userId = useCrewStore((s) => s.userId);
  if (!inCrew) {
    return (
      <Page title="Crew releases">
        <NotInCrew />
      </Page>
    );
  }
  const who = (id: string) => (id === userId ? "You" : (members.find((m) => m.user_id === id)?.display_name ?? "Former member"));
  const list = sortCrewReleases(releases, localDay(Date.now()));
  return (
    <Page title="Crew releases" sub={name ? `${name} · share yours from its page in Releases` : undefined}>
      <div className="flex-1 overflow-y-auto p-6">
        {list.length === 0 ? (
          <div className="text-sm text-engrave">No releases shared yet. Open one of yours in Releases and click "Share with the crew".</div>
        ) : (
          <div className="grid max-w-5xl gap-4 md:grid-cols-2">
            {list.map((r) => {
              const tracks = releaseTracks(r, songs);
              const done = tracks.filter((t) => isFinished(t.stage ?? undefined)).length;
              const dateMs = r.release_date ? new Date(`${r.release_date}T00:00:00`).getTime() : null;
              return (
                <article key={r.id} className="rounded-lg border border-rule bg-panel p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-8 w-8 shrink-0 rounded" style={{ background: r.color ?? "var(--color-raised)" }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-engrave">
                        {KIND_LABEL[r.kind] ?? r.kind} · {who(r.owner_id)}
                      </div>
                      <h2 className="truncate text-base font-semibold text-cream">{r.title}</h2>
                      <div className="text-xs text-body">
                        {dateMs ? `${new Date(dateMs).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · ${formatRelative(dateMs)}` : "No date yet"}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-engrave">
                      {done}/{tracks.length} finished
                    </span>
                  </div>
                  {tracks.length > 0 && (
                    <ol className="mt-3 flex flex-col gap-1 border-t border-rule pt-3">
                      {tracks.map((t, i) => (
                        <li key={t.id} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-right font-mono text-engrave">{i + 1}</span>
                          <StatusDot color={statusInfo(t.stage ?? undefined).color} size={6} glow={false} />
                          <span className="min-w-0 flex-1 truncate text-cream">{t.title}</span>
                          <span className="text-engrave">{statusInfo(t.stage ?? undefined).label}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}

