import type { ReactNode } from "react";
import { ArrowRight, Laptop, Lock, Monitor, Music2 } from "lucide-react";
import { STATUSES } from "@shared/lib/songs";

// The signed-out front door: what FL Manager is, real screenshots (the
// desktop app on its sample data), and the crew sign-in at the bottom.

const STAGE_LINES: Record<string, string> = {
  creation: "Beat and lyrics exist",
  production: "Recording, mixing, mastering",
  prep: "Cover, metadata, distributor",
  release: "Out everywhere",
  promotion: "Reels, stories, follow-up",
};

export function Landing({ signIn }: { signIn: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#0f0f12] text-[#e6e6ea]">
      <Nav />
      <Hero />
      <StageBand />
      <Feature
        kicker="The board"
        title="See every track move."
        body="Every song sits in one stage. Drag it forward on your computer, or from your phone between sessions: it lands in everyone's FL Manager, live."
        shot="/shots/pipeline.jpg"
        alt="The pipeline board: songs grouped by stage, with BPM, tags and mixdown status"
      />
      <Feature
        flip
        kicker="Launch Kit"
        title="Release-ready in one click."
        body="Title, credits, BPM and key pulled from the project. The hook found in your mixdown. 9:16 shorts for Reels and TikTok, cover concepts, and a sheet you paste straight into DistroKid."
        points={["Songwriters and splits from the credits", "Checks the master: WAV, 44.1 kHz, no clipping", "Release date that dodges the crew's other drops"]}
        shot="/shots/launch-kit.jpg"
        alt="The Launch Kit: detected metadata with source badges, snippets on the waveform and a 9:16 short"
      />
      <Feature
        kicker="Your files"
        title="Where everything lives."
        body="Project, backups, recorded takes, stems and mixdowns in one panel. Rename or move a project in Finder and its stage, notes and credits follow it."
        shot="/shots/song-panel.jpg"
        alt="The song panel: stage, key, release, tags, notes and project facts"
      />
      <Privacy />
      <Download />
      <section id="signin" className="border-t border-white/5 px-6 py-24">
        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Your crew's board, anywhere.</h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-white/55">
              Check what moved since last night, push a song to Prep, see what drops next. Sign in with your email: no password, just a code.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">{signIn}</div>
        </div>
      </section>
      <footer className="border-t border-white/5 px-6 py-10 text-xs text-white/35">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <Mark size={20} /> FL Manager · made with and for the crew
          </span>
          <span>Crew data stored in the EU (Ireland). Audio never leaves your computer.</span>
        </div>
      </footer>
    </div>
  );
}

function Mark({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-lg bg-orange-500 text-[#0f0f12]" style={{ width: size, height: size }}>
      <Music2 size={size * 0.55} strokeWidth={2.5} />
    </span>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0f0f12]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <a href="#top" className="flex items-center gap-2.5 font-semibold text-white">
          <Mark /> FL Manager
        </a>
        <nav className="hidden gap-6 text-sm text-white/55 md:flex">
          <a href="#board" className="hover:text-white">Features</a>
          <a href="#privacy" className="hover:text-white">Privacy</a>
          <a href="#download" className="hover:text-white">Download</a>
        </nav>
        <a href="#signin" className="ml-auto rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
          Sign in
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative px-6 pt-20 md:pt-28">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgba(249,115,22,0.35), rgba(15,15,18,0))" }}
      />
      <div className="relative mx-auto max-w-6xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-400">Made for FL Studio crews</p>
        <h1 className="mt-5 max-w-4xl text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-white sm:text-5xl md:text-7xl">
          From the first beat
          <br className="hidden sm:block" />{" "}
          to release day.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
          FL Manager reads your FL Studio projects and turns them into one place for the whole crew: where every song stands, where its files live,
          and a release kit ready for your distributor.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <a href="#signin" className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-400">
            Sign in to your crew <ArrowRight size={16} />
          </a>
          <a href="#download" className="rounded-lg border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/5">
            Get the desktop app
          </a>
          <span className="text-sm text-white/40">Free. Your audio stays on your computer.</span>
        </div>
      </div>
      <div className="relative mx-auto mt-16 max-w-6xl">
        <Shot src="/shots/dashboard.jpg" alt="FL Manager's dashboard: songs, stalled tracks, next release, crew activity and a year of studio sessions" eager />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0f0f12] to-transparent" />
      </div>
    </section>
  );
}

function Shot({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#16161b] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex gap-1.5 border-b border-white/5 px-4 py-3" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
      </div>
      <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} width={2880} height={1800} className="block h-auto w-full" />
    </div>
  );
}

function StageBand() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-4xl">Every song has a stage. The whole crew sees it.</h2>
        <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-xl sm:grid-cols-5">
          {STATUSES.map((s, i) => (
            <div key={s.id} className="flex min-h-[132px] flex-col justify-between p-5" style={{ background: s.color, color: i < 2 ? "#ffffff" : "#0f0f12" }}>
              <span className="text-xs font-semibold tabular-nums opacity-70">0{i + 1}</span>
              <div>
                <div className="text-lg font-semibold">{s.label}</div>
                <div className="mt-1 text-sm opacity-80">{STAGE_LINES[s.id]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Feature({
  kicker,
  title,
  body,
  points,
  shot,
  alt,
  flip = false,
}: {
  kicker: string;
  title: string;
  body: string;
  points?: string[];
  shot: string;
  alt: string;
  flip?: boolean;
}) {
  return (
    <section id={kicker === "The board" ? "board" : undefined} className="px-6 py-20">
      <div className={`mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-[0.8fr_1.2fr] ${flip ? "md:[&>*:first-child]:order-2 md:grid-cols-[1.2fr_0.8fr]" : ""}`}>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-400">{kicker}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">{title}</h2>
          <p className="mt-5 text-base leading-relaxed text-white/60">{body}</p>
          {points && (
            <ul className="mt-6 flex flex-col gap-2.5">
              {points.map((p) => (
                <li key={p} className="flex gap-3 text-sm text-white/75">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Shot src={shot} alt={alt} />
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="px-6 py-24">
      <div className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-white/[0.02] p-8 md:p-14">
        <Lock size={22} className="text-orange-400" />
        <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-5xl">Share titles, not tracks.</h2>
        <div className="mt-8 grid gap-8 text-base leading-relaxed md:grid-cols-2">
          <p className="text-white/60">
            You choose which songs the crew sees. Only the facts travel: title, stage, BPM, key, credits and release date.
          </p>
          <p className="text-white/60">
            Audio, project files, samples, notes and FL track names never leave your computer. Crew data is stored in the EU, in Ireland.
          </p>
        </div>
      </div>
    </section>
  );
}

function Download() {
  return (
    <section id="download" className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Get FL Manager.</h2>
        <p className="mt-4 max-w-xl text-base text-white/55">The desktop app runs next to FL Studio on Mac and Windows. Installers are on the way; until then your crew lead can set you up.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <span aria-disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/10 px-5 py-3 text-sm text-white/45">
            <Laptop size={16} /> macOS · coming soon
          </span>
          <span aria-disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-white/10 px-5 py-3 text-sm text-white/45">
            <Monitor size={16} /> Windows · coming soon
          </span>
        </div>
      </div>
    </section>
  );
}
