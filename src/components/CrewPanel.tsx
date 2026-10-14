import { statusInfo } from "../lib/songs";
import { useEffect, useState } from "react";
import { Check, ClipboardCopy, LogOut, RefreshCw, Users } from "lucide-react";
import { useCrewStore } from "../store/useCrewStore";
import { useAppStore } from "../store/useAppStore";
import { formatRelative } from "../lib/format";
import { orphanedShares, releaseSharedHere, shareElsewhere, sharedHere, sharedTitle, syncNote, unsharedTracks } from "../lib/crewSync";
import { btn, btnPrimary, ConfirmButton, input } from "../ui";
import { crewText } from "../lib/crewMessages";
import { cleanCode, isCodeComplete } from "../lib/signInCode";

const field = input;
const primary = `${btnPrimary} shrink-0 justify-center py-2`;
const secondary = `${btn} shrink-0 justify-center py-2`;

/** Settings → Crew: sign in, create or join a crew, invite, sync. */
export function CrewPanel() {
  const crew = useCrewStore();
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-cream">
        <Users size={15} /> Crew
      </h2>
      <p className="mt-1 text-xs text-engrave">
        Share chosen songs with your crew: everyone sees them on the crew board, the calendar and in "who's on what". For each shared
        song the crew sees its title, stage, BPM, key, tags, credits, release date, whether it has a mixdown, whether its Launch Kit is
        accepted, and when the project was last saved. They also see your crew and display names (not your email, which only the
        sign-in service keeps). Never audio, file paths, samples, notes or track names. Stored in the EU (Ireland).
      </p>
      <div className="mt-3">
        {!crew.enabled ? (
          <div className="text-xs text-body">Crew sharing isn't set up in this build (no crew server configured).</div>
        ) : !crew.ready ? (
          <div className="text-xs text-body">Loading…</div>
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
      ) : null}
      {!sentTo ? (
        <div className="text-[11px] text-engrave">{crewText("signInHint")}</div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => verifyCode(sentTo, code));
          }}
          className="flex flex-col gap-2"
        >
          <div className="text-xs text-engrave">
            We sent a sign-in code to <b className="text-cream">{sentTo}</b>. It expires in 10 minutes.
          </div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Sign-in code"
              className={`${field} font-mono tracking-[0.3em]`}
            />
            <button type="submit" disabled={busy || !isCodeComplete(code)} className={primary}>
              {busy ? "Checking…" : "Sign in"}
            </button>
          </div>
          <button type="button" onClick={() => (setSentTo(null), setCode(""))} className="self-start text-xs text-engrave hover:text-cream">
            Use another email
          </button>
        </form>
      )}
      {error && <div className="text-xs text-red-300">{error}</div>}
    </div>
  );
}

/** Same limits as the database checks (crews.name, crew_members.display_name). */
const CREW_NAME_MAX = 80;
const DISPLAY_NAME_MAX = 60;
/** create_crew / join_crew refuse an 11th crew. */
const MAX_CREWS = 10;

/** First crew, or (`another`) one more next to the crews I'm already in. */
function CreateOrJoin({ another = false, onDone }: { another?: boolean; onDone?: () => void }) {
  const createCrew = useCrewStore((s) => s.createCrew);
  const joinCrew = useCrewStore((s) => s.joinCrew);
  const signOut = useCrewStore((s) => s.signOut);
  const email = useCrewStore((s) => s.email);
  const lastName = useCrewStore((s) => s.crews.find((c) => c.id === s.activeCrewId)?.displayName ?? "");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(another ? lastName : "");
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  const done = (ok: boolean) => ok && onDone?.();

  return (
    <div className="flex flex-col gap-3">
      {!another && (
        <div className="flex flex-col gap-1 text-xs text-engrave" role="status">
          <span className="text-body">{crewText("noCrew", undefined, { email: email ?? "" })}</span>
          <span>{crewText("noInviteYet")}</span>
        </div>
      )}
      <label className="text-xs text-engrave">
        Your name in the crew (your artist name)
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          placeholder="e.g. Milo"
          className={`${field} mt-1`}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => joinCrew(code, displayName)).then(done);
          }}
          className="flex flex-col gap-2 rounded-md border border-rule p-3"
        >
          <span className="text-xs font-medium text-body">Join a crew</span>
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
            void run(() => createCrew(name, displayName)).then(done);
          }}
          className="flex flex-col gap-2 rounded-md border border-rule p-3"
        >
          <span className="text-xs font-medium text-body">Create a crew</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={CREW_NAME_MAX} placeholder="Crew name" aria-label="Crew name" className={field} />
          <button type="submit" disabled={busy || !name.trim() || !displayName.trim()} className={secondary}>
            Create
          </button>
        </form>
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
      {!another && (
        <button onClick={() => void signOut()} className="self-start text-xs text-engrave hover:text-cream">
          Sign out
        </button>
      )}
    </div>
  );
}

/** The crew you're in, all in one (Settings → Crew). The crew pages in the
 * sidebar use the same pieces. */
export function CrewHome() {
  return (
    <div className="flex flex-col gap-3">
      <CrewStatus />
      <CrewMembers />
      <CrewInvites />
      <CrewAccount />
    </div>
  );
}

function useActiveCrew() {
  const crews = useCrewStore((s) => s.crews);
  const activeCrewId = useCrewStore((s) => s.activeCrewId);
  return crews.find((c) => c.id === activeCrewId) ?? crews[0];
}

/** Which crew (switch if several), your role, sync state, why nothing syncs, what you share. */
export function CrewStatus() {
  const crew = useCrewStore();
  const scope = crew.activeCrewId && crew.userId ? { crewId: crew.activeCrewId, userId: crew.userId } : null;
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  const scanning = useAppStore((s) => s.scanning);
  const demoMode = useAppStore((s) => s.demoMode);
  const sharedCount = scope ? Object.values(workspace.songs).filter((m) => sharedHere(m, scope)).length : 0;
  const workspaceWritable = useAppStore((s) => s.workspaceWritable);
  const hasFolders = useAppStore((s) => s.settings.watchedFolders.length > 0);
  const note = syncNote({ demoMode, workspaceWritable, hasFolders, sharedCount });
  // Only meaningful once a scan has found something (an empty list could be a failed scan).
  const orphans = scope && projects.length > 0 && !scanning ? orphanedShares(projects, workspace, scope) : [];
  const active = useActiveCrew();
  const { busy, error, run } = useAction();
  if (!active) return null;

  const syncLine =
    crew.sync.kind === "syncing"
      ? "Syncing…"
      : crew.sync.kind === "synced"
        ? `Synced ${formatRelative(crew.sync.atMs) === "today" ? "just now" : formatRelative(crew.sync.atMs)}` +
          (crew.sync.skipped ? ` · ${crew.sync.skipped} song${crew.sync.skipped === 1 ? "" : "s"} refused by the server` : "")
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
          <span className="text-sm font-medium text-cream">{active.name}</span>
        )}
        <span className="rounded bg-rule px-1.5 py-px text-[10px] text-engrave">{active.role === "owner" ? "Owner" : "Member"}</span>
        <span className={`ml-auto text-xs ${crew.sync.kind === "error" ? "text-red-300" : "text-body"}`}>{syncLine}</span>
        <button onClick={() => void run(crew.syncNow)} disabled={busy || demoMode} title="Sync now" className="rounded p-1 text-body hover:bg-rule hover:text-cream disabled:opacity-40">
          <RefreshCw size={13} className={crew.sync.kind === "syncing" ? "animate-spin" : ""} />
        </button>
      </div>
      {note && (
        <div role="status" className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-cream">
          {note}
        </div>
      )}
      <div className="text-xs text-engrave">
        You share <b className="text-cream">{sharedCount}</b> song{sharedCount === 1 ? "" : "s"}. Share songs from their panel, or select
        several in the Library.
      </div>
      {orphans.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span className="flex-1">
            {orphans.length} shared song{orphans.length === 1 ? " isn't" : "s aren't"} in your library right now (renamed, moved or on an
            unplugged drive), so {orphans.length === 1 ? "its" : "their"} crew card is frozen.
          </span>
          <button onClick={() => crew.setShared(orphans, false)} className="shrink-0 underline hover:text-cream">
            Stop sharing {orphans.length === 1 ? "it" : "them"}
          </button>
        </div>
      )}
      {error && <div className="text-xs text-red-300">{error}</div>}
    </div>
  );
}

/** Members (the owner can remove people). */
export function CrewMembers() {
  const crew = useCrewStore();
  const active = useActiveCrew();
  const { busy, error, run } = useAction();
  if (!active) return null;
  const isOwner = active.role === "owner";
  return (
    <div>
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">Members · {crew.members.length}</div>
      <div className="flex flex-wrap gap-1.5">
        {crew.members.map((m) => (
          <span key={m.user_id} className="flex items-center rounded-full bg-raised px-2.5 py-1 text-xs text-body">
            {m.display_name}
            {m.role === "owner" && <span className="ml-1 text-engrave">· owner</span>}
            {m.user_id === crew.userId && <span className="ml-1 text-engrave">· you</span>}
            {isOwner && m.user_id !== crew.userId && (
              <ConfirmButton
                label="Remove"
                confirmLabel={`Remove ${m.display_name}?`}
                onConfirm={() => void run(() => crew.removeMember(m.user_id))}
                disabled={busy}
                className="ml-2 rounded-full border border-transparent px-1.5 text-[11px] text-engrave hover:text-cream disabled:opacity-40"
              />
            )}
          </span>
        ))}
      </div>
      {isOwner && crew.members.length > 1 && (
        <div className="mt-1 text-[11px] text-engrave">Removing someone takes their shared songs off the crew board.</div>
      )}
      {error && <div className="mt-1 text-xs text-red-300">{error}</div>}
    </div>
  );
}

/** Owner: open invite codes, a new code, revoke. Nothing for members. */
export function CrewInvites() {
  const crew = useCrewStore();
  const active = useActiveCrew();
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useAction();
  const isOwner = active?.role === "owner";
  const { loadInvites } = crew;
  useEffect(() => {
    if (isOwner) void loadInvites().catch(() => {});
  }, [isOwner, active?.id, loadInvites]);
  if (!active || !isOwner) return null;
  return (
    <div className="flex flex-col gap-3">
      {crew.invites.length > 0 && (
        <div>
          <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">Open invite codes · {crew.invites.length}</div>
          <div className="flex flex-col gap-1">
            {crew.invites.map((i) => (
              <div key={i.code} className="flex items-center gap-3 text-xs text-body">
                <code className="font-mono tracking-widest text-cream">{i.code}</code>
                <span>
                  {i.uses}/{i.max_uses} used
                </span>
                <span>expires {new Date(i.expires_at).toLocaleDateString()}</span>
                <ConfirmButton
                  label="Revoke"
                  confirmLabel="Revoke code?"
                  onConfirm={() => void run(() => crew.revokeInvite(i.code))}
                  disabled={busy}
                  className="ml-auto rounded border border-transparent px-1.5 py-0.5 text-engrave hover:text-cream disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={() => void run(crew.createInvite)} disabled={busy} className={secondary}>
          New invite code
        </button>
        {crew.invite && (
          <>
            <code className="rounded bg-rule px-2 py-1.5 font-mono text-sm tracking-widest text-cream">{crew.invite}</code>
            <button
              onClick={() => void navigator.clipboard?.writeText(crew.invite!).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1200)))}
              className="flex items-center gap-1 text-xs text-engrave hover:text-cream"
            >
              {copied ? <Check size={12} /> : <ClipboardCopy size={12} />} {copied ? "Copied" : "Copy"}
            </button>
            <span className="text-[11px] text-engrave">Valid 7 days, up to 10 people.</span>
          </>
        )}
      </div>
      {error && <div className="text-xs text-red-300">{error}</div>}
    </div>
  );
}

/** Leave the active crew (asks first; says who becomes owner). */
export function LeaveCrewButton({ className = "hover:text-cream" }: { className?: string }) {
  const crew = useCrewStore();
  const active = useActiveCrew();
  const { run } = useAction();
  if (!active) return null;
  return (
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
      className={className}
    >
      Leave crew
    </button>
  );
}

/** Join or create another crew, your email, leave, sign out. */
export function CrewAccount() {
  const crew = useCrewStore();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      {adding ? (
        <div className="rounded-md border border-rule p-3">
          <div className="mb-2 flex items-center text-xs font-medium text-body">
            Join or create another crew
            <button onClick={() => setAdding(false)} className="ml-auto text-engrave hover:text-cream">
              Cancel
            </button>
          </div>
          <CreateOrJoin another onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={crew.crews.length >= MAX_CREWS}
          title={crew.crews.length >= MAX_CREWS ? "You're in 10 crews, the most allowed. Leave one first." : undefined}
          className="self-start text-xs text-engrave hover:text-cream disabled:opacity-40"
        >
          + Join or create another crew
        </button>
      )}
      <div className="flex gap-3 text-xs text-engrave">
        <span>{crew.email}</span>
        <LeaveCrewButton />
        <button onClick={() => void crew.signOut()} className="flex items-center gap-1 hover:text-cream">
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

/** Release page: share the release and all its tracks with the crew at once. */
export function ReleaseShare({ albumId }: { albumId: string }) {
  const { can, crewName } = useCanShare();
  const crewId = useCrewStore((s) => s.activeCrewId);
  const userId = useCrewStore((s) => s.userId);
  const shareRelease = useCrewStore((s) => s.shareRelease);
  const setShared = useCrewStore((s) => s.setShared);
  const workspace = useAppStore((s) => s.workspace);
  const [note, setNote] = useState<string | null>(null);
  const album = workspace.albums.find((a) => a.id === albumId);
  if (!can || !crewId || !userId || !album) return null;
  const scope = { crewId, userId };
  const here = releaseSharedHere(album, scope);
  const elsewhere = !!album.shared && !!album.shareId && !here;
  const missing = unsharedTracks(album, workspace, scope);
  const say = (skipped: number) =>
    setNote(skipped ? `${skipped} track${skipped === 1 ? " is" : "s are"} shared with another crew, so ${skipped === 1 ? "it stays" : "they stay"} there.` : null);

  if (elsewhere) return <div className="mt-3 text-xs text-engrave">Shared with another crew or account.</div>;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
      {here ? (
        <>
          <span className="flex items-center gap-1.5 text-body">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
            Shared with {crewName} · {album.trackPaths.length - missing.length}/{album.trackPaths.length} tracks
          </span>
          {missing.length > 0 && (
            <button onClick={() => say(setShared(missing, true))} className="underline hover:text-cream">
              Share the {missing.length} other track{missing.length === 1 ? "" : "s"}
            </button>
          )}
          <ConfirmButton
            label="Stop sharing"
            confirmLabel="Stop sharing the release?"
            onConfirm={() => (shareRelease(album.id, false), setNote("The release leaves the crew's list. Its tracks stay shared."))}
            className="rounded border border-transparent px-1 text-engrave hover:text-cream"
          />
        </>
      ) : (
        <button onClick={() => say(shareRelease(album.id, true))} className={secondary}>
          Share with {crewName}
        </button>
      )}
      {!here && album.trackPaths.length > 0 && <span className="text-engrave">Shares the release and its {album.trackPaths.length} track{album.trackPaths.length === 1 ? "" : "s"}.</span>}
      {note && <span className="basis-full text-engrave">{note}</span>}
    </div>
  );
}

/** Song panel: share this song with the crew (opt-in). */
export function ShareToggle({ path }: { path: string }) {
  const { can, crewName } = useCanShare();
  const crewId = useCrewStore((s) => s.activeCrewId);
  const userId = useCrewStore((s) => s.userId);
  const meta = useAppStore((s) => s.workspace.songs[path]);
  const projectName = useAppStore((s) => s.projects.find((p) => p.path === path)?.name ?? "");
  const updateSong = useAppStore((s) => s.updateSong);
  const crews = useCrewStore((s) => s.crews);
  const setShared = useCrewStore((s) => s.setShared);
  const moveShares = useCrewStore((s) => s.moveShares);
  const { busy, error, run } = useAction();
  if (!can || !crewId || !userId) return null;
  const scope = { crewId, userId };
  const shared = sharedHere(meta, scope);
  const elsewhere = shareElsewhere(meta, scope);

  // Shared with another crew (or from another account): sharing it here as
  // well would strand that row, so it's an explicit move, or nothing.
  if (elsewhere && (elsewhere.shared || !elsewhere.mine)) {
    const other = crews.find((c) => c.id === elsewhere.crewId)?.name;
    return (
      <div className="mt-3 flex flex-col gap-1.5 rounded-md border border-rule bg-panel px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <Users size={13} className="text-body" />
          <span className="flex-1 text-body">
            {!elsewhere.mine ? (
              "Shared from another account on this computer. Sign in with it to change this."
            ) : (
              <>
                Shared with <b className="font-medium text-cream">{other ?? "a crew you're no longer in"}</b>. Move it to{" "}
                <b className="font-medium text-cream">{crewName}</b>?
              </>
            )}
          </span>
          {elsewhere.mine && (
            <ConfirmButton
              label="Move here"
              confirmLabel={other ? `Take it off ${other}?` : "Move it?"}
              onConfirm={() => void run(() => moveShares([path]))}
              disabled={busy}
              className="shrink-0 rounded border border-rule-strong px-2 py-1 text-body hover:bg-raised disabled:opacity-40"
            />
          )}
        </div>
        {error && <div className="text-red-300">{error}</div>}
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border border-rule bg-panel text-xs">
      <label className="flex cursor-pointer items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={shared}
          disabled={busy}
          onChange={(e) =>
            // Still waiting to be removed from another crew: finish that removal now, then share here.
            e.target.checked && elsewhere ? void run(() => moveShares([path])) : setShared([path], e.target.checked)
          }
          className="accent-[#ff5a1f]"
        />
        <Users size={13} className="text-body" />
        <span className="flex-1 text-body">
          Share with <b className="font-medium text-cream">{crewName}</b>
        </span>
        <span className={error ? "text-red-300" : "text-engrave"}>{error ?? (shared ? "On the crew board" : "Only you see it")}</span>
      </label>
      {shared && (
        <label className="flex items-center gap-2 border-t border-rule px-3 py-2 text-engrave">
          <span className="shrink-0">Crew sees it as</span>
          <input
            key={meta?.shareTitle ?? ""}
            defaultValue={meta?.shareTitle ?? ""}
            placeholder={sharedTitle(projectName)}
            maxLength={200}
            aria-label="Title the crew sees"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (meta?.shareTitle ?? "")) updateSong(path, { shareTitle: v || undefined });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="min-w-0 flex-1 rounded border border-rule bg-chassis px-2 py-1 text-body placeholder:text-engrave"
          />
        </label>
      )}
      </div>
  );
}

/** A crewmate moved this song on the crew board while this computer's move
 * was waiting to be sent: the owner picks which one stands. */
export function StageConflictBanner({ path }: { path: string }) {
  const conflict = useAppStore((s) => s.workspace.songs[path]?.stageConflict);
  const members = useCrewStore((s) => s.members);
  const resolve = useCrewStore((s) => s.resolveStageConflict);
  if (!conflict) return null;
  const who = members.find((m) => m.user_id === conflict.by)?.display_name ?? "A crewmate";
  const theirs = statusInfo(conflict.theirs ?? undefined).label;
  const mine = statusInfo(conflict.mine ?? undefined).label;
  return (
    <div role="alert" className="mt-3 flex flex-col gap-2 rounded-md border border-amber-400/30 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-100">
      <span>
        <b className="font-semibold">{who}</b> moved this song to <b className="font-semibold">{theirs}</b> on the crew board while your move
        to <b className="font-semibold">{mine}</b> was waiting to be sent. Which one stands?
      </span>
      <div className="flex gap-2">
        <button onClick={() => resolve(path, "theirs")} className="rounded border border-rule-strong px-2 py-1 text-body hover:bg-raised">
          Keep {theirs}
        </button>
        <button onClick={() => resolve(path, "mine")} className="rounded border border-rule-strong px-2 py-1 text-body hover:bg-raised">
          Keep {mine}
        </button>
      </div>
    </div>
  );
}
