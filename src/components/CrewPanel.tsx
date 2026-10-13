import { useState } from "react";
import { Check, ClipboardCopy, LogOut, RefreshCw, Users } from "lucide-react";
import { useCrewStore } from "../store/useCrewStore";
import { useAppStore } from "../store/useAppStore";
import { formatRelative } from "../lib/format";
import { orphanedShares, sharedHere } from "../lib/crewSync";

const field =
  "w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-orange-400/50 focus:outline-none";
const primary = "shrink-0 rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-[#0f0f12] hover:bg-orange-400 disabled:opacity-40";
const secondary = "shrink-0 rounded-md border border-white/15 px-3 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40";

/** Settings → Crew: sign in, create or join a crew, invite, sync. */
export function CrewPanel() {
  const crew = useCrewStore();
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white/90">
        <Users size={15} /> Crew
      </h2>
      <p className="mt-1 text-xs text-white/58">
        Share chosen songs with your crew: everyone sees them on the crew board, the calendar and in "who's on what". Only metadata is shared
        (title, stage, BPM, key, tags, credits, release date), never audio, file paths, samples or notes. Stored in the EU.
      </p>
      <div className="mt-3">
        {!crew.enabled ? (
          <div className="text-xs text-white/62">Crew sharing isn't set up in this build (no crew server configured).</div>
        ) : !crew.ready ? (
          <div className="text-xs text-white/62">Loading…</div>
        ) : !crew.userId ? (
          <SignIn />
        ) : crew.crews.length === 0 && crew.loadError ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-red-300">Couldn't load your crews: {crew.loadError}</span>
            <button onClick={() => void crew.loadCrews().catch(() => {})} className={secondary}>
              Try again
            </button>
          </div>
        ) : crew.crews.length === 0 ? (
          <CreateOrJoin />
        ) : (
          <CrewHome />
        )}
      </div>
    </section>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function SignIn() {
  const sendCode = useCrewStore((s) => s.sendCode);
  const verifyCode = useCrewStore((s) => s.verifyCode);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run } = useAction();

  return (
    <div className="flex flex-col gap-2">
      {!sentTo ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => sendCode(email)).then((ok) => ok && setSentTo(email.trim()));
          }}
          className="flex gap-2"
        >
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" autoComplete="email" className={field} />
          <button type="submit" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} className={primary}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => verifyCode(sentTo, code));
          }}
          className="flex flex-col gap-2"
        >
          <div className="text-xs text-white/55">
            We sent a 6-digit code to <b className="text-white/80">{sentTo}</b>. It expires in 10 minutes.
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Sign-in code"
              className={`${field} font-mono tracking-[0.3em]`}
            />
            <button type="submit" disabled={busy || code.length !== 6} className={primary}>
              {busy ? "Checking…" : "Sign in"}
            </button>
          </div>
          <button type="button" onClick={() => (setSentTo(null), setCode(""))} className="self-start text-xs text-white/58 hover:text-white">
            Use another email
          </button>
        </form>
      )}
      {error && <div className="text-xs text-red-300">{error}</div>}
    </div>
  );
}

function CreateOrJoin() {
  const createCrew = useCrewStore((s) => s.createCrew);
  const joinCrew = useCrewStore((s) => s.joinCrew);
  const signOut = useCrewStore((s) => s.signOut);
  const email = useCrewStore((s) => s.email);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-white/50">
        Signed in as {email}. Join your crew with the invite code someone sent you, or create the crew and invite them.
      </div>
      <label className="text-xs text-white/50">
        Your name in the crew (your artist name)
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Milo" className={`${field} mt-1`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => joinCrew(code, displayName));
          }}
          className="flex flex-col gap-2 rounded-md border border-white/10 p-3"
        >
          <span className="text-xs font-medium text-white/70">Join a crew</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
            placeholder="INVITE CODE"
            aria-label="Invite code"
            className={`${field} font-mono tracking-widest`}
          />
          <button type="submit" disabled={busy || code.length !== 8 || !displayName.trim()} className={primary}>
            Join
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => createCrew(name, displayName));
          }}
          className="flex flex-col gap-2 rounded-md border border-white/10 p-3"
        >
          <span className="text-xs font-medium text-white/70">Create a crew</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Crew name" aria-label="Crew name" className={field} />
          <button type="submit" disabled={busy || !name.trim() || !displayName.trim()} className={secondary}>
            Create
          </button>
        </form>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
      <button onClick={() => void signOut()} className="self-start text-xs text-white/58 hover:text-white">
        Sign out
      </button>
    </div>
  );
}

function CrewHome() {
  const crew = useCrewStore();
  const scope = crew.activeCrewId && crew.userId ? { crewId: crew.activeCrewId, userId: crew.userId } : null;
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const scanning = useAppStore((s) => s.scanning);
  const demoMode = useAppStore((s) => s.demoMode);
  const sharedCount = scope ? Object.values(workspace.songs).filter((m) => sharedHere(m, scope)).length : 0;
  // Only meaningful once a scan has found something (an empty list could be a failed scan).
  const orphans = scope && projects.length > 0 && !scanning ? orphanedShares(projects, workspace, scope) : [];
  const active = crew.crews.find((c) => c.id === crew.activeCrewId) ?? crew.crews[0];
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAction();

  const syncLine =
    crew.sync.kind === "syncing"
      ? "Syncing…"
      : crew.sync.kind === "synced"
        ? `Synced ${formatRelative(crew.sync.atMs) === "today" ? "just now" : formatRelative(crew.sync.atMs)}`
        : crew.sync.kind === "error"
          ? crew.sync.message
          : "Not synced yet";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {crew.crews.length > 1 ? (
          <select value={active.id} onChange={(e) => void crew.selectCrew(e.target.value)} className={`${field} !w-auto`}>
            {crew.crews.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm font-medium text-white">{active.name}</span>
        )}
        <span className="rounded bg-white/10 px-1.5 py-px text-[10px] text-white/55">{active.role === "owner" ? "Owner" : "Member"}</span>
        <span className={`ml-auto text-xs ${crew.sync.kind === "error" ? "text-red-300" : "text-white/62"}`}>{syncLine}</span>
        <button onClick={() => void run(crew.syncNow)} disabled={busy || demoMode} title="Sync now" className="rounded p-1 text-white/62 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <RefreshCw size={13} className={crew.sync.kind === "syncing" ? "animate-spin" : ""} />
        </button>
      </div>
      {demoMode && <div className="text-xs text-amber-300">Sample data is never shared. Link your real folder to sync.</div>}
      <div className="text-xs text-white/55">
        You share <b className="text-white/80">{sharedCount}</b> song{sharedCount === 1 ? "" : "s"}. Share songs from their panel, or select
        several in the Library.
      </div>
      {orphans.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span className="flex-1">
            {orphans.length} shared song{orphans.length === 1 ? " isn't" : "s aren't"} in your library right now (renamed, moved or on an
            unplugged drive), so {orphans.length === 1 ? "its" : "their"} crew card is frozen.
          </span>
          <button onClick={() => crew.setShared(orphans, false)} className="shrink-0 underline hover:text-white">
            Stop sharing {orphans.length === 1 ? "it" : "them"}
          </button>
        </div>
      )}
      <div>
        <div className="mb-1 text-[12px] font-semibold text-white/55">Members · {crew.members.length}</div>
        <div className="flex flex-wrap gap-1.5">
          {crew.members.map((m) => (
            <span key={m.user_id} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/75">
              {m.display_name}
              {m.role === "owner" && <span className="ml-1 text-white/55">· owner</span>}
              {m.user_id === crew.userId && <span className="ml-1 text-white/55">· you</span>}
            </span>
          ))}
        </div>
      </div>
      {active.role === "owner" && (
        <div className="flex items-center gap-2">
          <button onClick={() => void run(crew.createInvite)} disabled={busy} className={secondary}>
            New invite code
          </button>
          {crew.invite && (
            <>
              <code className="rounded bg-white/10 px-2 py-1.5 font-mono text-sm tracking-widest text-white">{crew.invite}</code>
              <button
                onClick={() => void navigator.clipboard?.writeText(crew.invite!).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))}
                className="flex items-center gap-1 text-xs text-white/50 hover:text-white"
              >
                {copied ? <Check size={12} /> : <ClipboardCopy size={12} />} {copied ? "Copied" : "Copy"}
              </button>
              <span className="text-[11px] text-white/55">Valid 7 days, up to 10 people.</span>
            </>
          )}
        </div>
      )}
      {error && <div className="text-xs text-red-300">{error}</div>}
      <div className="flex gap-3 text-xs text-white/58">
        <span>{crew.email}</span>
        <button
          onClick={() => {
            const others = crew.members.filter((m) => m.user_id !== crew.userId);
            const note =
              active.role === "owner" && others.length
                ? ` ${others[0].display_name} becomes the owner.`
                : !others.length
                  ? " You're the last member, so the crew is deleted."
                  : "";
            if (window.confirm(`Leave ${active.name}? Your shared songs leave the crew board with you.${note}`)) void run(crew.leaveCrew);
          }}
          className="hover:text-white"
        >
          Leave crew
        </button>
        <button onClick={() => void crew.signOut()} className="flex items-center gap-1 hover:text-white">
          <LogOut size={11} /> Sign out
        </button>
      </div>
    </div>
  );
}

/** Signed in, with a crew, on real data: sharing controls can show. */
export function useCanShare(): { can: boolean; crewName: string | null } {
  const userId = useCrewStore((s) => s.userId);
  const crews = useCrewStore((s) => s.crews);
  const activeCrewId = useCrewStore((s) => s.activeCrewId);
  const demoMode = useAppStore((s) => s.demoMode);
  const crewName = crews.find((c) => c.id === activeCrewId)?.name ?? null;
  return { can: !!userId && !!activeCrewId && !demoMode, crewName };
}

/** Song panel: share this song with the crew (opt-in). */
export function ShareToggle({ path }: { path: string }) {
  const { can, crewName } = useCanShare();
  const crewId = useCrewStore((s) => s.activeCrewId);
  const userId = useCrewStore((s) => s.userId);
  const shared = useAppStore((s) => !!crewId && !!userId && sharedHere(s.workspace.songs[path], { crewId, userId }));
  const setShared = useCrewStore((s) => s.setShared);
  if (!can) return null;
  return (
    <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
      <input type="checkbox" checked={shared} onChange={(e) => setShared([path], e.target.checked)} className="accent-orange-500" />
      <Users size={13} className="text-white/62" />
      <span className="flex-1 text-white/75">
        Share with <b className="font-medium text-white/90">{crewName}</b>
      </span>
      <span className="text-white/55">{shared ? "On the crew board" : "Only you see it"}</span>
    </label>
  );
}
