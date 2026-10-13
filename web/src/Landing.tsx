import type { ReactNode } from "react";
import { ArrowRight, Music2 } from "lucide-react";
import { STATUSES } from "@shared/lib/songs";

// The signed-out front door, "studio wall" style: loud condensed type, mono
// for data, real screenshots, crew voice. Sign-in sits up top and at the end.

const STAGE_LINES: Record<string, string> = {
  creation: "Beat's down, bars coming",
  production: "Recording, mix, master",
  prep: "Cover, credits, distro",
  release: "It's out",
  promotion: "Clips, reels, keep it moving",
};

const primary = "inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-3 text-sm font-bold text-[#0f0f12] hover:bg-orange-400";
const ghost = "inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5";
const kicker = "font-mono text-xs tracking-wider text-orange-400";

export function Landing({ signIn }: { signIn: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#0f0f12] text-[#e6e6ea]">
      <Nav />
      <Hero />
      <Stages />
      <Feature
        id="board"
        n="01"
        name="Board"
        title="Know what everyone's cooking."
        body="Every song sits in one stage. Drag it from Creation to Prep and the whole crew sees it: on the desktop app, or from your phone between sessions."
        shot="/shots/pipeline.jpg"
        caption="fig. 01 · pipeline · sample data"
        alt="The pipeline board: songs grouped by stage, with BPM, tags and mixdown status"
      />
      <Feature
        flip
        n="02"
        name="Launch Kit"
        title="Bounce it. We'll pack it."
        body="Title, BPM, key and credits pulled straight from the project. The hook found in your mixdown. Vertical clips for Reels and TikTok, cover ideas, and a sheet you paste into DistroKid."
        points={["Songwriters and splits from the credits", "Checks the master: WAV, 44.1 kHz, no clipping", "Release date that dodges the crew's other drops"]}
        shot="/shots/launch-kit.jpg"
        caption="fig. 02 · launch kit · reviewed, ready to export"
        alt="The Launch Kit: detected metadata with source badges, snippets on the waveform and a 9:16 short"
      />
      <Feature
        n="03"
        name="Files"
        title="Where's the latest bounce? Right here."
        body="Project, backups, takes, stems and mixdowns in one panel. Rename or move the folder and nothing breaks: stage, notes and credits follow it."
        shot="/shots/song-panel.jpg"
        caption="fig. 03 · song panel"
        alt="The song panel: stage, key, release, tags, notes and project facts"
      />
      <Privacy />
      <section id="signin" className="border-t border-white/10 px-6 py-24">
        <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <h2 className="font-display text-5xl uppercase leading-[0.95] text-white md:text-6xl">Crew only.</h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">Got an invite? Drop your email and we'll send a code. No password.</p>
            <p className="mt-3 max-w-md text-sm text-white/60">The desktop app is crew-only for now: ask your crew lead to set you up.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">{signIn}</div>
        </div>
      </section>
      <footer className="border-t border-white/10 px-6 py-10 text-xs text-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <Mark size={20} /> FL Manager · made with and for the crew
          </span>
          <span className="font-mono">crew data: EU (Ireland) · audio: never leaves your machine</span>
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
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0f0f12]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <a href="#top" className="flex items-center gap-2.5 font-semibold text-white">
          <Mark /> FL Manager
        </a>
        <nav className="hidden gap-6 text-sm text-white/70 md:flex">
          <a href="#board" className="hover:text-white">
            How it works
          </a>
          <a href="#privacy" className="hover:text-white">
            Privacy
          </a>
        </nav>
        <a href="#signin" className="ml-auto rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">
          Sign in
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="px-6 pt-16 md:pt-24">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-[3.4rem] uppercase leading-[0.92] text-white sm:text-7xl md:text-[7.5rem]">
          Who's got the hook?
          <br />
          <span className="text-white/60">Where's the mixdown?</span>
          <br />
          <span className="text-orange-500">When does it drop?</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/75">
          One board for the crew's projects. It answers all three: every song's stage, where its files live, and a release kit ready for your
          distributor.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a href="#signin" className={primary}>
            Sign in to your crew <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <a href="#board" className={ghost}>
            How it works
          </a>
        </div>
        <p className="mt-5 font-mono text-xs text-white/60">your beats never leave your laptop</p>
      </div>
      <div className="mx-auto mt-16 max-w-6xl">
        <Shot
          src="/shots/dashboard.jpg"
          caption="fig. 00 · the crew's studio · sample data"
          alt="FL Manager's dashboard: songs, stalled tracks, next release, crew activity and a year of studio sessions"
          eager
        />
      </div>
    </section>
  );
}

function Shot({ src, alt, caption, eager = false }: { src: string; alt: string; caption: string; eager?: boolean }) {
  return (
    <figure>
      <div className="overflow-hidden rounded-md border border-white/15 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]">
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} width={2880} height={1800} className="block h-auto w-full" />
      </div>
      <figcaption className="mt-3 font-mono text-[11px] text-white/55">{caption}</figcaption>
    </figure>
  );
}

function Stages() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-4xl uppercase leading-[0.95] text-white md:text-6xl">Every song has a stage.</h2>
        <p className="mt-4 text-base text-white/70">The whole crew sees it. Nobody has to ask.</p>
        <ol className="mt-10 grid gap-x-8 border-t border-white/15 sm:grid-cols-5">
          {STATUSES.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-3 border-b border-white/10 py-4 sm:block sm:border-b-0 sm:py-6">
              <span className="font-mono text-xs text-white/60">0{i + 1}</span>
              <div className="sm:mt-3">
                <div className="flex items-center gap-2 font-display text-2xl uppercase text-white">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </div>
                <div className="mt-1 text-sm text-white/65">{STAGE_LINES[s.id]}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Feature({
  id,
  n,
  name,
  title,
  body,
  points,
  shot,
  caption,
  alt,
  flip = false,
}: {
  id?: string;
  n: string;
  name: string;
  title: string;
  body: string;
  points?: string[];
  shot: string;
  caption: string;
  alt: string;
  flip?: boolean;
}) {
  return (
    <section id={id} className="px-6 py-20">
      <div className={`mx-auto grid max-w-6xl items-center gap-12 ${flip ? "md:grid-cols-[1.25fr_0.75fr] md:[&>*:first-child]:order-2" : "md:grid-cols-[0.75fr_1.25fr]"}`}>
        <div>
          <p className={kicker}>
            {n} / {name}
          </p>
          <h2 className="mt-4 font-display text-4xl uppercase leading-[0.95] text-white md:text-5xl">{title}</h2>
          <p className="mt-5 text-base leading-relaxed text-white/72">{body}</p>
          {points && (
            <ul className="mt-6 flex flex-col gap-2.5">
              {points.map((p) => (
                <li key={p} className="flex gap-3 text-sm text-white/80">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" /> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Shot src={shot} alt={alt} caption={caption} />
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="px-6 py-24">
      <div className="mx-auto max-w-6xl rounded-2xl bg-[#f2efe8] p-8 text-[#0f0f12] md:p-14">
        <h2 className="font-display text-5xl uppercase leading-[0.95] md:text-7xl">Share titles, not tracks.</h2>
        <p className="mt-5 max-w-2xl text-lg">Your beats don't leave your laptop. The crew sees the facts you choose to share. That's it.</p>
        <div className="mt-10 grid gap-8 font-mono text-sm md:grid-cols-2">
          <div>
            <div className="text-xs font-bold tracking-wider text-[#0f0f12]/70">WHAT TRAVELS</div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {["title", "stage", "bpm · key", "credits · splits", "release date"].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#1f8a4c]" /> {x}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-bold tracking-wider text-[#0f0f12]/70">WHAT STAYS ON YOUR MACHINE</div>
            <ul className="mt-3 flex flex-col gap-1.5 text-[#0f0f12]/60">
              {["audio", "project files", "samples", "notes", "track names"].map((x) => (
                <li key={x} className="line-through decoration-[#0f0f12]/40">
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
