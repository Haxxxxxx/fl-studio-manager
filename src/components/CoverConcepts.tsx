import { useEffect, useState } from "react";
import { Check, FolderOpen, ImageIcon, Images, RefreshCw, Save } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { buildCoverPrompt, COVER_VARIANTS, FREE_NEURONS_PER_DAY, NEURONS_PER_IMAGE, randomSeeds } from "../lib/cover";
import type { CoverImage } from "../types";
import { btn, btnPrimary } from "./ui";

interface Concept {
  prompt: string;
  variant: number;
  seed: number;
  image?: CoverImage;
  error?: string;
}

interface Session {
  concepts: Concept[];
  picked: number | null;
}

// Generated images live here, in memory, per song: they survive switching
// views but never go into the workspace (only the pick's seed/prompt does).
const sessions = new Map<string, Session>();
const listeners = new Set<() => void>();
const EMPTY: Session = { concepts: [], picked: null };

function update(path: string, fn: (s: Session) => Session) {
  sessions.set(path, fn(sessions.get(path) ?? EMPTY));
  listeners.forEach((l) => l());
}

function useSession(path: string): Session {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return sessions.get(path) ?? EMPTY;
}

const PER_DAY = Math.floor(FREE_NEURONS_PER_DAY / NEURONS_PER_IMAGE);

/** FLUX cover concepts (Cloudflare Workers AI, free tier) for the brief
 * above. Drafts at 1024 px; the final cover is a designer's job. */
export function CoverConcepts({ path, title, artists, brief }: { path: string; title: string; artists: string; brief: string }) {
  const coverStatus = useAppStore((s) => s.coverStatus);
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const saved = useAppStore((s) => s.workspace.songs[path]?.launchKit?.cover);
  const setKitCover = useAppStore((s) => s.setKitCover);
  const setView = useAppStore((s) => s.setView);
  const session = useSession(path);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; dir?: string } | null>(null);

  if (!coverStatus?.configured) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm">
        <ImageIcon size={16} className="shrink-0 text-orange-300" />
        <span className="flex-1 text-xs text-white/60">
          Turn this brief into cover concepts with FLUX. It's free: a Cloudflare account gives about {PER_DAY} images a day, no card needed.
        </span>
        <button onClick={() => setView("settings")} className={btn}>
          Set up
        </button>
      </div>
    );
  }

  const running = session.concepts.some((c) => !c.image && !c.error);
  const picked = session.picked != null ? session.concepts[session.picked] : undefined;
  const size = session.concepts.find((c) => c.image?.width)?.image;

  function generate(batch: { prompt: string; variant: number }[]) {
    setMessage(null);
    const seeds = randomSeeds(batch.length);
    const concepts = batch.map((b, i) => ({ ...b, seed: seeds[i] }));
    update(path, () => ({ concepts, picked: null }));
    concepts.forEach((c, i) => {
      api
        .generateCover(c.prompt, c.seed)
        .then((image) => patch(i, c.seed, { image, seed: image.seed }))
        .catch((e) => patch(i, c.seed, { error: e instanceof Error ? e.message : String(e) }));
    });
  }

  /** Fill slot i, unless a newer batch replaced it meanwhile. */
  function patch(i: number, seed: number, p: Partial<Concept>) {
    update(path, (s) => (s.concepts[i]?.seed !== seed ? s : { ...s, concepts: s.concepts.map((c, j) => (j === i ? { ...c, ...p } : c)) }));
  }

  function generateFour() {
    generate(COVER_VARIANTS.map((_, variant) => ({ prompt: buildCoverPrompt({ brief, title, artists, variant }), variant })));
  }

  function moreLikeThis() {
    if (!picked) return;
    generate(Array.from({ length: 4 }, () => ({ prompt: picked.prompt, variant: picked.variant })));
  }

  function pick(i: number) {
    const c = session.concepts[i];
    if (!c?.image) return;
    update(path, (s) => ({ ...s, picked: i }));
    setMessage(null);
    setKitCover(path, { seed: c.seed, prompt: c.prompt, variant: c.variant });
  }

  async function save() {
    if (!picked?.image) return;
    if (!settings.outputFolder) return setMessage({ kind: "error", text: "Set an export folder in Settings first." });
    setSaving(true);
    try {
      const file = await api.saveCover({ outputFolder: settings.outputFolder, folderName: title, imageB64: picked.image.imageB64 });
      setKitCover(path, { seed: picked.seed, prompt: picked.prompt, variant: picked.variant, savedPath: file, savedAtMs: Date.now() });
      setMessage({ kind: "ok", text: "Saved as cover-concept.jpg in the kit folder.", dir: file });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">Cover concepts · FLUX</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={generateFour} disabled={running || !brief.trim()} className={session.concepts.length ? btn : btnPrimary}>
            <Images size={14} /> {running ? "Painting…" : session.concepts.length ? "4 new concepts" : "Generate 4 concepts"}
          </button>
          {picked && (
            <>
              <button onClick={moreLikeThis} disabled={running} className={btn} title="Four more with this concept's prompt and new seeds">
                <RefreshCw size={14} /> More like this
              </button>
              <button
                onClick={save}
                disabled={running || saving || demoMode}
                title={demoMode ? "Saving is off for sample data" : "Writes cover-concept.jpg into <export folder>/Launch Kits/<song>/"}
                className={btnPrimary}
              >
                <Save size={14} /> {saving ? "Saving…" : "Save to kit"}
              </button>
            </>
          )}
        </div>
      </div>

      {session.concepts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {session.concepts.map((c, i) => (
            <button
              key={`${c.seed}-${i}`}
              onClick={() => pick(i)}
              disabled={!c.image}
              aria-pressed={session.picked === i}
              aria-label={`Concept ${i + 1}`}
              className={`relative aspect-square overflow-hidden rounded-md border bg-white/[0.03] ${
                session.picked === i ? "border-orange-400 ring-2 ring-orange-400/60" : "border-white/10 hover:border-white/30"
              }`}
            >
              {c.image ? (
                <img src={`data:image/jpeg;base64,${c.image.imageB64}`} alt={`Cover concept ${i + 1}`} className="h-full w-full object-cover" />
              ) : c.error ? (
                <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] leading-snug text-red-300">{c.error}</span>
              ) : (
                <span className="absolute inset-0 flex animate-pulse items-center justify-center text-[11px] text-white/35">Painting…</span>
              )}
              {session.picked === i && (
                <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  <Check size={10} /> Picked
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {session.concepts.length > 0 && !running && session.picked == null && session.concepts.some((c) => c.image) && (
        <div className="text-xs text-white/50">Click a concept to pick it.</div>
      )}
      {message && (
        <div className={`flex items-center gap-2 text-xs ${message.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}>
          {message.text}
          {message.dir && (
            <button onClick={() => api.revealInFileManager(message.dir!)} className="flex items-center gap-1 underline">
              <FolderOpen size={12} /> Show
            </button>
          )}
        </div>
      )}
      {!session.concepts.length && saved?.savedPath && (
        <div className="flex items-center gap-2 text-xs text-white/50">
          A concept is saved in the kit (cover-concept.jpg).
          <button onClick={() => api.revealInFileManager(saved.savedPath!)} className="flex items-center gap-1 text-white/60 underline hover:text-white">
            <FolderOpen size={12} /> Show
          </button>
        </div>
      )}

      {picked && (
        <details className="text-[11px] text-white/40">
          <summary className="cursor-pointer hover:text-white/70">
            Prompt sent to FLUX (seed {picked.seed}
            {picked.image && !picked.image.seedApplied ? ", not applied by Cloudflare" : ""})
          </summary>
          <p className="mt-1 whitespace-pre-wrap font-mono leading-relaxed text-white/50">{picked.prompt}</p>
        </details>
      )}

      <div className="rounded-md border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
        Concepts are drafts at {size?.width && size.height ? `${size.width} × ${size.height}` : "1024 × 1024"} px. Distributors need 3000 × 3000:
        a designer (or an upscaler) makes the final from the pick and adds the title and artist name, which FLUX leaves out on purpose.
      </div>
      <div className="text-[11px] leading-relaxed text-white/30">
        Each concept uses about {Math.round(NEURONS_PER_IMAGE)} of Cloudflare's {FREE_NEURONS_PER_DAY.toLocaleString("en")} free daily neurons (about {PER_DAY} a day).
        Only the image prompt goes to Cloudflare: it's built from this brief, without the title, names or notes.
      </div>
    </div>
  );
}
