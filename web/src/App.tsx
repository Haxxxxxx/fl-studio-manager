import { useEffect, useMemo, useState } from "react";
import { Wordmark } from "./LogoMark";
import { CalendarDays, CheckCircle2, Disc3, KanbanSquare, LogOut, Users } from "lucide-react";
import { STATUSES, UNSORTED, statusInfo } from "@shared/lib/songs";
import { formatRelative } from "@shared/lib/format";
import type { CrewSongRow, SongStatus } from "@shared/types";
import { useWeb } from "./store";
import { Landing } from "./Landing";

const input =
  "w-full rounded-lg border border-rule-strong bg-chassis px-3 py-2.5 text-base text-cream placeholder:text-engrave shadow-[inset_0_2px_3px_rgb(0_0_0/0.5)] focus:border-hot focus:outline-none sm:text-sm";
const primary = "rounded bg-hot px-4 py-2.5 font-display uppercase tracking-[0.06em] text-[15px] font-bold text-chassis hover:bg-hot-hover disabled:cursor-not-allowed disabled:opacity-70";
const COLUMNS = [{ id: undefined as SongStatus | undefined, ...UNSORTED }, ...STATUSES];
type Tab = "board" | "calendar" | "crew";

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

export function App() {
  const { ready, userId, crews, init, error, loadError } = useWeb();
  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return <Centered>Loading…</Centered>;
  if (!userId) return <Landing signIn={<SignIn />} />;
  if (crews.length === 0 && loadError) return <Shell><LoadFailed message={loadError} /></Shell>;
  if (crews.length === 0) return <Shell><Join /></Shell>;
  return <Dashboard topError={error} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center text-sm text-body">{children}</div>;
}

function Logo() {
  return (
    <div className="flex items-end gap-2.5">
      <Wordmark size={26} />
      <div className="pb-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-engrave">Crew</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-10">
      <Logo />
      {children}
      <p className="mt-auto text-[11px] leading-relaxed text-engrave">
        Your crew's shared songs: titles, stages, BPM, key, tags, credits and release dates. Never audio, files, notes or track names. Stored in the EU (Ireland).
      </p>
    </div>
  );
}

function SignIn() {
  const { sendCode, verifyCode } = useWeb();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Sign in to your crew</h1>
      {!sentTo ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => sendCode(email)).then((ok) => ok && setSentTo(email.trim()));
          }}
        >
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" autoComplete="email" className={input} />
          <button disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())} className={primary}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => verifyCode(sentTo, code));
          }}
        >
          <p className="text-sm text-body">
            Enter the 6-digit code sent to <b className="text-cream">{sentTo}</b>.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Sign-in code"
            className={`${input} text-center font-mono text-2xl tracking-[0.4em]`}
          />
          <button disabled={busy || code.length !== 6} className={primary}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button type="button" onClick={() => (setSentTo(null), setCode(""))} className="text-xs text-engrave hover:text-cream">
            Use another email
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

/** Loading the crew list failed: say so (an empty list isn't "no crews"). */
function LoadFailed({ message }: { message: string }) {
  const { loadCrews, signOut } = useWeb();
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Couldn't load your crews</h1>
      <p className="text-sm text-red-300">{error ?? message}</p>
      <button onClick={() => void run(loadCrews)} disabled={busy} className={primary}>
        {busy ? "Trying…" : "Try again"}
      </button>
      <button onClick={() => void signOut()} className="self-start text-xs text-engrave hover:text-cream">
        Sign out
      </button>
    </div>
  );
}

/** Same limits as the database checks (crews.name, crew_members.display_name). */
const CREW_NAME_MAX = 80;
const DISPLAY_NAME_MAX = 60;
/** create_crew / join_crew refuse an 11th crew. */
const MAX_CREWS = 10;

/** First crew, or (`another`) one more next to the crews I'm already in. */
function Join({ another = false, onDone }: { another?: boolean; onDone?: () => void }) {
  const { joinCrew, createCrew, email, signOut } = useWeb();
  const lastName = useWeb((s) => s.crews.find((c) => c.id === s.activeCrewId)?.displayName ?? "");
  const [displayName, setDisplayName] = useState(another ? lastName : "");
  const [code, setCode] = useState("");
  const [crewName, setCrewName] = useState("");
  const { busy, error, run } = useAction();
  const done = (ok: boolean) => ok && onDone?.();
  return (
    <div className="flex flex-col gap-4">
      {!another && (
        <>
          <h1 className="text-xl font-semibold">Join your crew</h1>
          <p className="text-sm text-engrave">Signed in as {email}. Enter the invite code from your crew.</p>
        </>
      )}
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={DISPLAY_NAME_MAX}
        placeholder="Your name in the crew (artist name)"
        aria-label="Your name in the crew"
        className={input}
      />
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
        placeholder="INVITE CODE"
        aria-label="Invite code"
        className={`${input} text-center font-mono tracking-widest`}
      />
      <button onClick={() => void run(() => joinCrew(code, displayName)).then(done)} disabled={busy || code.length !== 8 || !displayName.trim()} className={primary}>
        Join crew
      </button>
      <details className="text-sm text-engrave">
        <summary className="cursor-pointer text-body">Starting a new crew instead?</summary>
        <div className="mt-3 flex flex-col gap-3">
          <input value={crewName} onChange={(e) => setCrewName(e.target.value)} maxLength={CREW_NAME_MAX} placeholder="Crew name" aria-label="Crew name" className={input} />
          <button onClick={() => void run(() => createCrew(crewName, displayName)).then(done)} disabled={busy || !crewName.trim() || !displayName.trim()} className="rounded-lg border border-rule-strong px-4 py-2.5 text-sm text-cream hover:bg-raised disabled:opacity-40">
            Create crew
          </button>
        </div>
      </details>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {!another && (
        <button onClick={() => void signOut()} className="self-start text-xs text-engrave hover:text-cream">
          Sign out
        </button>
      )}
    </div>
  );
}

function Dashboard({ topError }: { topError: string | null }) {
  const { crews, activeCrewId, selectCrew, signOut, songs } = useWeb();
  const [tab, setTab] = useState<Tab>("board");
  const active = crews.find((c) => c.id === activeCrewId) ?? crews[0];
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "board", label: "Board", icon: <KanbanSquare size={15} /> },
    { id: "calendar", label: "Calendar", icon: <CalendarDays size={15} /> },
    { id: "crew", label: "Crew", icon: <Users size={15} /> },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-rule px-4 py-3 sm:px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          {crews.length > 1 ? (
            <select value={active.id} onChange={(e) => void selectCrew(e.target.value)} className="rounded-md border border-rule bg-raised px-2 py-1.5 text-sm">
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-medium text-cream">{active.name}</span>
          )}
          <button onClick={() => void signOut()} aria-label="Sign out" className="rounded p-1.5 text-engrave hover:bg-rule hover:text-cream">
            <LogOut size={15} />
          </button>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-rule px-3 sm:px-5" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${tab === t.id ? "border-orange-400 text-cream" : "border-transparent text-engrave hover:text-cream"}`}
          >
            {t.icon} {t.label}
            {t.id === "board" && <span className="text-engrave">{songs.length}</span>}
          </button>
        ))}
      </nav>
      {topError && <div className="mx-4 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{topError}</div>}
      <main className="flex min-h-0 flex-1 flex-col">
        {tab === "board" && <Board />}
        {tab === "calendar" && <Calendar />}
        {tab === "crew" && <Crew />}
      </main>
    </div>
  );
}

function useNames() {
  const members = useWeb((s) => s.members);
  return useMemo(() => new Map(members.map((m) => [m.user_id, m.display_name])), [members]);
}

function Board() {
  const songs = useWeb((s) => s.songs);
  const moveSong = useWeb((s) => s.moveSong);
  const userId = useWeb((s) => s.userId);
  const names = useNames();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const byStage = useMemo(() => {
    const m = new Map<string, CrewSongRow[]>(COLUMNS.map((c) => [c.id ?? "", []]));
    for (const s of songs) m.get(s.stage ?? "")?.push(s);
    return m;
  }, [songs]);

  if (songs.length === 0) {
    return <div className="p-8 text-center text-sm text-body">Nothing shared yet. Songs appear here when the crew shares them from Hivo.</div>;
  }
  const card = (s: CrewSongRow) => <SongCard key={s.id} s={s} you={s.owner_id === userId} owner={names.get(s.owner_id)} mover={s.stage_updated_by ? (s.stage_updated_by === userId ? "you" : names.get(s.stage_updated_by)) : undefined} onMove={(st) => void moveSong(s.id, st).catch(() => {})} />;
  const empty = COLUMNS.filter((c) => !(byStage.get(c.id ?? "") ?? []).length);
  return (
    <>
      {/* Phones: one list grouped by stage (columns don't fit a narrow screen). */}
      <div className="flex flex-col gap-5 p-4 sm:hidden">
        {COLUMNS.filter((c) => (byStage.get(c.id ?? "") ?? []).length).map((col) => (
          <section key={col.label} aria-label={col.label} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="h-2 w-2 self-center rounded-full" style={{ background: col.color }} />
              <span className="text-sm font-medium text-cream">{col.label}</span>
              <span className="text-sm text-engrave">{byStage.get(col.id ?? "")!.length}</span>
              <span className="truncate text-[11px] text-engrave">{col.hint}</span>
            </div>
            {byStage.get(col.id ?? "")!.map(card)}
          </section>
        ))}
        {empty.length > 0 && <p className="text-[11px] text-engrave">Empty: {empty.map((c) => c.label).join(", ")}</p>}
      </div>
      <div className="hidden flex-1 gap-3 overflow-x-auto p-5 sm:flex">
      {COLUMNS.map((col) => {
        const key = col.id ?? "";
        const items = byStage.get(key) ?? [];
        return (
          <section
            key={key}
            aria-label={col.label}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(key);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((k) => (k === key ? null : k));
              }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("application/x-crew-song");
              if (id) void moveSong(id, col.id ?? null).catch(() => {});
            }}
            className={`flex min-w-[200px] flex-1 basis-0 flex-col rounded-xl border ${dragOver === key ? "border-orange-400/50 bg-orange-500/[0.05]" : "border-rule bg-panel"}`}
          >
            <div className="px-3 pb-2 pt-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                <span className="text-sm font-medium text-cream">{col.label}</span>
                <span className="text-sm text-engrave">{items.length}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-engrave">{col.hint}</p>
            </div>
            <div className="flex flex-col gap-2 px-2 pb-2">{items.map(card)}</div>
          </section>
        );
      })}
      </div>
    </>
  );
}

function SongCard({ s, you, owner, mover, onMove }: { s: CrewSongRow; you: boolean; owner?: string; mover?: string; onMove: (stage: SongStatus | null) => void }) {
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("application/x-crew-song", s.id);
      }}
      className="rounded-lg border border-rule bg-raised px-3 py-2.5"
    >
      <div className="truncate text-sm font-medium text-cream">{s.title}</div>
      <div className="mt-1 text-xs text-body">
        {you ? "You" : (owner ?? "Crewmate")}
        {s.bpm != null && ` · ${Math.round(s.bpm)} BPM`}
        {s.musical_key && ` · ${s.musical_key}`}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-engrave">
        {s.last_saved_at && <span>saved {formatRelative(Date.parse(s.last_saved_at))}</span>}
        {s.release_date && <span>· out {s.release_date}</span>}
        <span className="ml-auto flex items-center gap-1">
          {s.has_mixdown && <Disc3 size={11} aria-label="Has a mixdown" />}
          {s.kit_accepted && <CheckCircle2 size={11} className="text-emerald-300/80" aria-label="Launch Kit accepted" />}
        </span>
      </div>
      {/* Touch screens can't drag: a stage picker on every card. */}
      <label className="mt-2 flex items-center gap-2 text-[11px] text-engrave">
        Stage
        <select
          value={s.stage ?? ""}
          onChange={(e) => onMove((e.target.value || null) as SongStatus | null)}
          aria-label={`Stage of ${s.title}`}
          className="flex-1 rounded border border-rule bg-raised px-1.5 py-1.5 text-sm text-cream sm:py-1 sm:text-xs"
        >
          <option value="">{UNSORTED.label}</option>
          {STATUSES.map((st) => (
            <option key={st.id} value={st.id}>
              {st.label}
            </option>
          ))}
        </select>
      </label>
      {mover && s.stage_updated_by !== s.owner_id && <div className="mt-1 text-[10px] text-engrave">moved by {mover}</div>}
    </article>
  );
}

function Calendar() {
  const songs = useWeb((s) => s.songs);
  const names = useNames();
  const userId = useWeb((s) => s.userId);
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dated = songs
    .filter((s) => s.release_date)
    .map((s) => {
      const [y, m, d] = s.release_date!.split("-").map(Number);
      return { s, date: new Date(y, m - 1, d) };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const upcoming = dated.filter((x) => x.date.getTime() >= todayMs);
  const past = dated.filter((x) => x.date.getTime() < todayMs).reverse();

  if (dated.length === 0) return <div className="p-8 text-center text-sm text-body">No release dates yet. They come from the crew's releases and Launch Kits.</div>;
  const Row = ({ s, date }: { s: CrewSongRow; date: Date }) => (
    <div className="flex items-center gap-3 rounded-xl border border-rule bg-panel p-3">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-raised py-1">
        <span className="text-[10px]  text-body">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
        <span className="text-lg font-semibold leading-tight">{date.getDate()}</span>
        <span className="text-[10px]  text-body">{date.toLocaleDateString(undefined, { month: "short" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{s.title}</div>
        <div className="text-xs text-body">
          {s.owner_id === userId ? "You" : (names.get(s.owner_id) ?? "Crewmate")} · {statusInfo(s.stage ?? undefined).label}
          {s.kit_accepted ? " · kit ready" : ""}
        </div>
      </div>
      <span className="shrink-0 text-xs text-body">{formatRelative(date.getTime())}</span>
    </div>
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4 sm:p-6">
      <h2 className="text-xs font-medium  text-engrave">Coming up</h2>
      {upcoming.length ? upcoming.map((x) => <Row key={x.s.id} {...x} />) : <p className="text-sm text-body">Nothing planned.</p>}
      {past.length > 0 && <h2 className="mt-4 text-xs font-medium  text-engrave">Released</h2>}
      {past.slice(0, 10).map((x) => (
        <Row key={x.s.id} {...x} />
      ))}
    </div>
  );
}

function Crew() {
  const { members, songs, userId, crews } = useWeb();
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => {
          const theirs = songs.filter((s) => s.owner_id === m.user_id);
          const active = theirs.filter((s) => s.stage === "creation" || s.stage === "production").length;
          const last = Math.max(0, ...theirs.map((s) => (s.last_saved_at ? Date.parse(s.last_saved_at) : 0)));
          return (
            <div key={m.user_id} className="rounded-xl border border-rule bg-panel p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{m.display_name}</span>
                {m.role === "owner" && <span className="text-xs text-engrave">owner</span>}
                {m.user_id === userId && <span className="text-xs text-engrave">you</span>}
              </div>
              <div className="mt-1 text-xs text-body">
                {theirs.length} shared · {active} being made · {last ? `last session ${formatRelative(last)}` : "no sessions yet"}
              </div>
              <div className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-raised">
                {COLUMNS.map((c) => {
                  const n = theirs.filter((s) => (s.stage ?? undefined) === c.id).length;
                  return n ? <span key={c.label} style={{ flexGrow: n, background: c.color }} title={`${c.label}: ${n}`} /> : null;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {adding ? (
        <div className="max-w-md rounded-xl border border-rule p-4">
          <div className="mb-3 flex items-center text-sm font-medium text-cream">
            Join or create another crew
            <button onClick={() => setAdding(false)} className="ml-auto text-xs text-engrave hover:text-cream">
              Cancel
            </button>
          </div>
          <Join another onDone={() => setAdding(false)} />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={crews.length >= MAX_CREWS}
          title={crews.length >= MAX_CREWS ? "You're in 10 crews, the most allowed. Leave one first." : undefined}
          className="self-start text-sm text-body hover:text-cream disabled:opacity-40"
        >
          + Join or create another crew
        </button>
      )}
    </div>
  );
}
