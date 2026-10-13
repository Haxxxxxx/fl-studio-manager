import type { ReactNode } from "react";
import { ArrowRight, Check, Minus } from "lucide-react";
import { LogoLockup, LogoMark } from "./LogoMark";
import { STATUSES } from "@shared/lib/songs";

// The signed-out front door, "studio wall" style: loud condensed type, mono
// for data, real screenshots (sample data), crew voice. Every claim here has
// to be true of the shipped app: when a feature changes, change this page.

const VERSION = "0.2.0";
const UPDATED = "October 2026";

const STAGE_LINES: Record<string, string> = {
  creation: "Beat's down, bars coming",
  production: "Recording, mix, master",
  prep: "Cover, credits, distro",
  release: "It's out",
  promotion: "Clips, reels, keep it moving",
};

const primary = "inline-flex items-center gap-2 rounded bg-hot px-5 py-2.5 font-display uppercase tracking-[0.06em] text-base font-bold text-chassis hover:bg-hot-hover";
const ghost = "inline-flex items-center gap-2 rounded border border-rule-strong px-5 py-2.5 font-display uppercase tracking-[0.06em] text-base font-semibold text-cream hover:bg-raised";
const kicker = "font-mono text-[11px] uppercase tracking-[0.14em] text-hot";
const h2 = "font-display text-4xl uppercase leading-[0.95] text-cream md:text-6xl";

const NAV = [
  ["#features", "Features"],
  ["#launch-kit", "Launch Kit"],
  ["#privacy", "Privacy"],
  ["#status", "Status"],
  ["#faq", "FAQ"],
] as const;

export function Landing({ signIn }: { signIn: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-chassis text-body">
      <Nav />
      <main>
        <Hero />
        <Daws />
        <Stages />
        <div id="features" className="scroll-mt-20">
          <Feature
            n="01"
            name="Library"
            title="Every project. Every file."
            body="Point Hivo at your projects folders once. Each song gets one card with its project, backups, takes, stems and mixdowns, and what it needs to open on this computer."
            points={[
              "Backups, renders and recorded takes grouped under their song",
              "Missing samples and plugins flagged before you open the project (most complete for FL Studio)",
              "Rename or move a folder: stage, notes and credits follow it",
              "Clean up old backups to the Trash, and nothing is ever deleted for good without asking",
              "Package a song for a collaborator: the project and its samples in one zip, the file list shown first (FL Studio)",
            ]}
            shot="song-panel"
            caption="fig. 01 · song panel · sample data"
            alt="The song panel: stage, key, release, tags, notes, backups and project facts"
          />
          <Feature
            flip
            n="02"
            name="Board"
            title="Know what everyone's cooking."
            body="Every song sits in one stage. Drag it from Creation to Prep and the whole crew sees it, on the desktop app or from a phone between sessions."
            points={[
              "A shared crew board: moves sync live",
              "Two people move the same song? Hivo asks which move stands. Nothing gets overwritten",
              "Release calendar with readiness: finished tracks, accepted kits, Friday drops",
              "Stalled tracks (no save in 21 days) and who's on what, on the dashboard",
            ]}
            shot="pipeline"
            caption="fig. 02 · pipeline · sample data"
            alt="The pipeline board: songs grouped by stage, with BPM, tags and mixdown status"
          />
        </div>
        <LaunchKit />
        <Crew />
        <Privacy />
        <Status />
        <Faq />
        <section id="signin" className="scroll-mt-20 border-t border-rule px-6 py-24">
          <div className="mx-auto grid max-w-5xl gap-12 md:grid-cols-[1.1fr_1fr] md:items-center">
            <div>
              <h2 className={h2}>Crew only.</h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-body">
                Hivo is invite-only for now. Your crew lead adds your email, then you sign in here with a 6-digit code (no password) and enter your
                crew's invite code.
              </p>
              <p className="mt-3 max-w-md text-sm text-body">The desktop app (Mac and Windows) comes from your crew lead too.</p>
            </div>
            <div className="rounded-2xl border border-rule bg-panel p-6">{signIn}</div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-chassis/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <a href="#top" aria-label="Hivo, back to top">
          <LogoLockup size={32} />
        </a>
        <nav aria-label="Sections" className="hidden gap-6 text-sm text-body lg:flex">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} className="hover:text-cream">
              {label}
            </a>
          ))}
        </nav>
        <a href="#signin" className="ml-auto rounded-lg border border-rule-strong px-4 py-2 text-sm font-semibold text-cream hover:bg-raised">
          Sign in
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="scroll-mt-20 px-6 pt-16 md:pt-24">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-[3.4rem] uppercase leading-[0.92] text-cream sm:text-7xl md:text-[7.5rem]">
          Who's got the hook?
          <br />
          <span className="text-body">Where's the mixdown?</span>
          <br />
          <span className="text-hot">When does it drop?</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-body">
          Hivo is the crew's studio app. It reads the project folders you already have (FL Studio, Ableton Live, REAPER, Studio One and more)
          and answers all three: every song's stage, where its files live, and a release kit ready for your distributor.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a href="#signin" className={primary}>
            Sign in to your crew <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <a href="#features" className={ghost}>
            See what it does
          </a>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-body" aria-label="At a glance">
          {["Mac + Windows", "works offline", "free", "your audio stays on your laptop", "crew data in the EU", `v${VERSION}`].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto mt-16 max-w-6xl">
        <Shot name="dashboard" caption="fig. 00 · the crew's studio · sample data" alt="Hivo's dashboard: songs, stalled tracks, next release, crew activity and a year of studio sessions" eager />
      </div>
    </section>
  );
}

/** 1440 px for phones and regular screens, 2880 px for retina. */
function Shot({ name, alt, caption, eager = false }: { name: string; alt: string; caption: string; eager?: boolean }) {
  return (
    <figure>
      {/* Tap or click for the full-size image (hard to read on a phone otherwise). */}
      <a
        href={`/shots/${name}.jpg`}
        target="_blank"
        rel="noopener"
        aria-label={`${alt} (full size)`}
        className="block overflow-hidden rounded-md border border-rule-strong shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream"
      >
        <img
          src={`/shots/${name}-1440.jpg`}
          srcSet={`/shots/${name}-1440.jpg 1440w, /shots/${name}.jpg 2880w`}
          sizes="(min-width: 1200px) 1152px, 100vw"
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          width={1440}
          height={900}
          className="block h-auto w-full"
        />
      </a>
      <figcaption className="mt-3 font-mono text-[11px] text-engrave">{caption}</figcaption>
    </figure>
  );
}

const READ_INSIDE = [
  ["FL Studio", ".flp"],
  ["Ableton Live", ".als"],
  ["REAPER", ".rpp"],
  ["Studio One", ".song"],
];
const TRACKED = [
  ["Pro Tools", ".ptx"],
  ["Cubase", ".cpr"],
  ["Bitwig Studio", ".bwproject"],
];

function Daws() {
  const chip = (name: string, ext: string) => (
    <li key={name} className="flex items-baseline justify-between gap-3 border-b border-rule py-2.5">
      <span className="font-display text-xl uppercase text-cream">{name}</span>
      <span className="font-mono text-xs text-engrave">{ext}</span>
    </li>
  );
  return (
    <section className="px-6 pt-28" aria-labelledby="daws-title">
      <div className="mx-auto max-w-6xl">
        <p className={kicker}>Works with</p>
        <h2 id="daws-title" className={`mt-4 ${h2}`}>
          Whatever you make it in.
        </h2>
        <p className="mt-4 max-w-2xl text-base text-body">
          Hivo finds each DAW's usual projects folder on your computer and proposes it; you choose what to link. Nothing is ever written into
          your project files.
        </p>
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          <div>
            <h3 className="font-mono text-xs uppercase tracking-wider text-cream">Read inside</h3>
            <p className="mt-1 text-sm text-body md:min-h-10">Tempo, time signature, plugins, samples and track names.</p>
            <ul className="mt-3">{READ_INSIDE.map(([n, e]) => chip(n, e))}</ul>
          </div>
          <div>
            <h3 className="font-mono text-xs uppercase tracking-wider text-cream">Tracked</h3>
            <p className="mt-1 text-sm text-body md:min-h-10">Closed formats: stages, backups, mixdowns and crew sharing, but nothing read from inside.</p>
            <ul className="mt-3">{TRACKED.map(([n, e]) => chip(n, e))}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stages() {
  return (
    <section className="px-6 py-28" aria-labelledby="stages-title">
      <div className="mx-auto max-w-6xl">
        <h2 id="stages-title" className={h2}>
          Every song has a stage.
        </h2>
        <p className="mt-4 text-base text-body">The whole crew sees it. Nobody has to ask.</p>
        <ol className="mt-10 grid gap-x-8 border-t border-rule-strong sm:grid-cols-5">
          {STATUSES.map((s, i) => (
            <li key={s.id} className="flex items-baseline gap-3 border-b border-rule py-4 sm:block sm:border-b-0 sm:py-6">
              <span className="font-mono text-xs text-body">0{i + 1}</span>
              <div className="sm:mt-3">
                <div className="flex items-center gap-2 font-display text-2xl uppercase text-cream">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </div>
                <div className="mt-1 text-sm text-body">{STAGE_LINES[s.id]}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-2.5">
      {items.map((p) => (
        <li key={p} className="flex gap-3 text-sm leading-relaxed text-cream">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-hot" aria-hidden /> {p}
        </li>
      ))}
    </ul>
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
  children,
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
  children?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 px-6 py-20" aria-labelledby={`f-${n}`}>
      <div className={`mx-auto grid max-w-6xl items-center gap-12 ${flip ? "md:grid-cols-[1.25fr_0.75fr] md:[&>*:first-child]:order-2" : "md:grid-cols-[0.8fr_1.2fr]"}`}>
        <div>
          <p className={kicker}>
            {n} / {name}
          </p>
          <h2 id={`f-${n}`} className="mt-4 font-display text-4xl uppercase leading-[0.95] text-cream md:text-5xl">
            {title}
          </h2>
          <p className="mt-5 text-base leading-relaxed text-body">{body}</p>
          {points && <Points items={points} />}
          {children}
        </div>
        <Shot name={shot} alt={alt} caption={caption} />
      </div>
    </section>
  );
}

function LaunchKit() {
  const parts = [
    ["Metadata", "Title, artists, BPM, key, duration and credits from the project, each marked detected, suggested or needs you."],
    ["Snippets", "The hook found in your mixdown (the part that comes back most), a teaser and an alt. Drag them on the waveform, 7 to 60 seconds."],
    ["Shorts", "9:16 videos with a waveform for Reels, TikTok and Shorts, rendered on your computer with free ffmpeg."],
    ["Captions", "Announce, teaser and release-day posts, in French or English, never mixed."],
    ["Cover", "A brief for your designer, plus optional cover concepts (free, with your own Cloudflare account)."],
    ["Checks", "Master format (WAV, 44.1 kHz, no clipping), release date on a Friday that dodges the crew's other drops, splits that add up."],
  ];
  return (
    <section id="launch-kit" className="scroll-mt-20 px-6 py-20" aria-labelledby="f-03">
      <div className="mx-auto max-w-6xl">
        <p className={kicker}>03 / Launch Kit</p>
        <div className="mt-4 grid gap-10 md:grid-cols-[1fr_1fr] md:items-end">
          <h2 id="f-03" className="font-display text-4xl uppercase leading-[0.95] text-cream md:text-6xl">
            Bounce it. We'll pack it.
          </h2>
          <p className="text-base leading-relaxed text-body">
            Everything a release needs, built from the song itself. Review it, fix what Hivo flags ("N need you" takes you there), then export one
            folder: the distributor sheet, metadata, snippets, captions, cover brief, and a README that says what each file is for.
          </p>
        </div>
        <div className="mt-12">
          <Shot name="launch-kit" caption="fig. 03 · launch kit · sample data" alt="The Launch Kit: metadata with source badges, snippets on the waveform, and a 9:16 short" />
        </div>
        <dl className="mt-12 grid gap-px overflow-hidden rounded-md border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
          {parts.map(([t, d]) => (
            <div key={t} className="bg-chassis p-5">
              <dt className="font-display text-xl uppercase text-cream">{t}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-body">{d}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-body">
          <span className="text-cream">AI is optional.</span> With your own free Gemini key, Hivo drafts the captions and cover brief and
          double-checks every field. Without one, everything above still works.
        </p>
      </div>
    </section>
  );
}

function Crew() {
  const items = [
    ["One board, every screen", "The desktop app and the crew website show the same board, calendar and crew. The website works on a phone."],
    ["Share song by song", "Nothing is shared until you tick it. Choose the title the crew sees, so it doesn't have to be the file name."],
    ["Invite only", "Your crew lead adds you and sends an invite code. Owners can revoke codes and remove members."],
    ["No passwords", "Sign in with a 6-digit code from your email, on the app or the website."],
  ];
  return (
    <section id="crew" className="scroll-mt-20 px-6 py-20" aria-labelledby="f-04">
      <div className="mx-auto max-w-6xl">
        <p className={kicker}>04 / Crew</p>
        <h2 id="f-04" className={`mt-4 ${h2}`}>
          The crew, on the same page.
        </h2>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {items.map(([t, d]) => (
            <div key={t} className="border-t border-rule-strong pt-5">
              <h3 className="font-display text-2xl uppercase text-cream">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section id="privacy" className="scroll-mt-20 px-6 py-24" aria-labelledby="privacy-title">
      <div className="mx-auto max-w-6xl rounded-2xl bg-cream p-8 text-chassis md:p-14">
        <h2 id="privacy-title" className="font-display text-5xl uppercase leading-[0.95] md:text-7xl">
          Share titles, not tracks.
        </h2>
        <p className="mt-5 max-w-2xl text-lg">Your beats don't leave your laptop. The crew sees the facts you choose to share. That's it.</p>
        <div className="mt-10 grid gap-8 font-mono text-sm md:grid-cols-2">
          <div>
            <h3 className="text-xs font-bold tracking-wider text-chassis/80">WHAT TRAVELS (SONGS YOU SHARE)</h3>
            <ul className="mt-3 flex flex-col gap-1.5">
              {["title", "stage", "bpm · key · tags", "credits · splits", "release date", "mixdown: yes / no", "kit accepted · last saved"].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#1f8a4c]" aria-hidden /> {x}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-wider text-chassis/80">WHAT STAYS ON YOUR MACHINE</h3>
            <ul className="mt-3 flex flex-col gap-1.5 text-chassis/80">
              {["audio", "project files and paths", "samples", "notes", "track names"].map((x) => (
                <li key={x} className="line-through decoration-chassis/40">
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-10 max-w-2xl font-mono text-xs leading-relaxed text-chassis/80">
          Crew data is stored in the EU (Ireland). Optional AI, with your own free Gemini key: the song name, tags, tempo, key, credits and Launch
          Kit text go to Google, and on the free tier Google may use them. Your notes only if you turn that on. Never audio, files or track names.
        </p>
      </div>
    </section>
  );
}

function Status() {
  const ready = [
    "Library and scanning for 7 DAWs",
    "Pipeline, release calendar, crew board and website",
    "Launch Kit: metadata, snippets, shorts, captions, cover concepts, export",
    "Installers for Mac (Apple Silicon and Intel) and Windows",
  ];
  const limits = [
    "Pro Tools, Cubase and Bitwig projects are tracked, not read inside",
    "Rendering and packaging from the app work with FL Studio only",
    "The missing-plugin check is most complete for FL Studio projects",
    "The app isn't code-signed yet: a one-time security prompt on first launch",
  ];
  const next = ["Plugin checks for every DAW", "The release calendar in Google or Apple Calendar", "Posting snippets and captions to socials from the Launch Kit"];
  const col = (title: string, items: string[], icon: ReactNode) => (
    <div className="rounded-md border border-rule bg-panel p-6">
      <h3 className="font-mono text-xs uppercase tracking-wider text-cream">{title}</h3>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-body">
            <span className="mt-0.5 shrink-0">{icon}</span>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section id="status" className="scroll-mt-20 px-6 py-20" aria-labelledby="status-title">
      <div className="mx-auto max-w-6xl">
        <p className={kicker}>
          Version {VERSION} · {UPDATED}
        </p>
        <h2 id="status-title" className={`mt-4 ${h2}`}>
          Where it's at.
        </h2>
        <p className="mt-4 max-w-2xl text-base text-body">Built with and for one crew. Here's what works, what doesn't yet, and what's next.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {col("Ready", ready, <Check size={15} className="text-ok" aria-label="Ready" />)}
          {col("Known limits", limits, <Minus size={15} className="text-warn" aria-label="Limit" />)}
          {col("On the list", next, <ArrowRight size={15} className="text-engrave" aria-label="Next" />)}
        </div>
      </div>
    </section>
  );
}

const FAQ: [string, ReactNode][] = [
  ["Is it free?", "Yes. The optional AI and cover concepts use free tiers with your own keys, and everything works without them."],
  ["Does my audio go anywhere?", "No. Audio, project files, samples, notes and track names stay on your computer. Only the facts of songs you choose to share reach the crew."],
  ["Do I need internet?", "No. The app works fully offline; crew sharing catches up the next time you're online."],
  ["Mac or Windows?", "Both: Mac (Apple Silicon and Intel) and Windows 10/11, and crew members can mix the two."],
  ["How do I get the app?", "It's crew-only for now. Your crew lead adds your email, sends you the installer and an invite code."],
  ["Is it in French?", "The app is in English. Captions and the kit README come in French or English, and sign-in messages follow your browser's language."],
  ["Can I use it on my own?", "Yes. The library, pipeline and Launch Kit work without a crew; sharing is optional."],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 px-6 py-20" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl">
        <h2 id="faq-title" className={h2}>
          Questions.
        </h2>
        <div className="mt-10 border-t border-rule-strong">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-rule">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-display text-xl uppercase text-cream marker:hidden hover:text-hot focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream">
                {q}
                <span className="font-mono text-lg text-engrave transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="pb-5 text-sm leading-relaxed text-body">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-rule px-6 py-10 text-xs text-body">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <LogoMark size={20} /> Hivo {VERSION} · made with and for the crew
        </span>
        <nav aria-label="Footer" className="flex gap-4">
          <a href="#privacy" className="hover:text-cream">
            Privacy
          </a>
          <a href="#status" className="hover:text-cream">
            Status
          </a>
          <a href="#faq" className="hover:text-cream">
            FAQ
          </a>
        </nav>
        <span className="font-mono">crew data: EU (Ireland) · audio: never leaves your machine</span>
      </div>
    </footer>
  );
}
