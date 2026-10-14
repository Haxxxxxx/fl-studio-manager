import type { ReactNode } from "react";
import { useCrewStore, useInCrew } from "../store/useCrewStore";
import { CrewBoard } from "./CrewBoard";
import { CrewAccount, CrewInvites, CrewMembers, CrewStatus } from "./CrewPanel";

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

export function CrewBoardView() {
  const inCrew = useInCrew();
  const name = useCrewName();
  return (
    <Page title="Crew board" sub={name ? `${name} · anyone in the crew can move a card` : undefined}>
      {inCrew ? <CrewBoard /> : <NotInCrew />}
    </Page>
  );
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
