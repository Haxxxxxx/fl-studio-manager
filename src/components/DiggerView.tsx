import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FolderPlus, Pause, Play, RefreshCw, Search, Shovel } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { MAX_PICKS, filterBeats, useDigger } from "../store/useDigger";
import { audioSrc } from "../lib/tauri";
import { formatBytes, formatRelative } from "../lib/format";
import { dict, tr } from "../i18n";
import type { BeatFile } from "../types";
import { DigPanel } from "./DigPanel";

// The Digger: your raw beats (Settings → Beats folders). Pick up to 5 and dig
// the web for similar ones to start a new song on (DigPanel).

const NB = " ";
// A stable empty list: a fresh [] in a store selector re-renders forever.
const NO_FOLDERS: string[] = [];

const T = dict(
  {
    title: "Digger",
    sub: "Your raw beats. Pick up to 5 and dig for similar ones to start a new song.",
    noFolder: "No beats folder yet. Add the folder where you keep your downloaded beats.",
    addFolder: "Add a beats folder",
    empty: "No beats found in your beats folders (mp3, wav, ogg or flac).",
    filter: "Search beats",
    rescan: "Look again",
    picked: (n: number) => `${n}/${MAX_PICKS} picked`,
    clear: "Clear",
    full: `${MAX_PICKS} beats max: unpick one first.`,
    play: (name: string) => `Play ${name}`,
    pause: (name: string) => `Pause ${name}`,
    pick: (name: string) => `Pick ${name}`,
    loading: "Looking for beats…",
  },
  {
    title: "Digger",
    sub: "Tes prods brutes. Choisis-en jusqu'à 5 et pars à la recherche de prods dans le même esprit pour un nouveau son.",
    noFolder: "Pas encore de dossier de prods. Ajoute le dossier où tu ranges les prods que tu télécharges.",
    addFolder: "Ajouter un dossier de prods",
    empty: "Aucune prod trouvée dans tes dossiers de prods (mp3, wav, ogg ou flac).",
    filter: "Chercher une prod",
    rescan: "Relancer",
    picked: (n: number) => `${n}/${MAX_PICKS} choisies`,
    clear: "Vider",
    full: `${MAX_PICKS} prods max${NB}: retires-en une d'abord.`,
    play: (name: string) => `Écouter ${name}`,
    pause: (name: string) => `Pause ${name}`,
    pick: (name: string) => `Choisir ${name}`,
    loading: "Recherche des prods…",
  },
);

export function DiggerView() {
  const t = tr(T);
  const folders = useAppStore((s) => s.settings.beatFolders ?? NO_FOLDERS);
  const addBeatFolder = useAppStore((s) => s.addBeatFolder);
  const { beats, loading, error, picked, query, load, toggle, clearPicks, setQuery } = useDigger();
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const shown = useMemo(() => filterBeats(beats, query), [beats, query]);
  const full = picked.length >= MAX_PICKS;
  const folderKey = folders.join("|");

  useEffect(() => {
    if (folderKey) void load();
  }, [folderKey, load]);

  const playToggle = (b: BeatFile) => {
    const el = audio.current;
    if (!el) return;
    if (playing === b.path) {
      el.pause();
      setPlaying(null);
      return;
    }
    el.src = audioSrc(b.path);
    void el.play().catch(() => setPlaying(null));
    setPlaying(b.path);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <audio ref={audio} onEnded={() => setPlaying(null)} className="hidden" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-6 py-3">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 font-display text-3xl uppercase leading-none tracking-tight text-cream">
            <Shovel size={22} aria-hidden /> {t.title}
          </h1>
          <p className="mt-1 text-xs text-engrave">{t.sub}</p>
        </div>
        {folders.length > 0 && (
          <>
            <label className="flex items-center gap-1.5 rounded-md border border-rule bg-chassis px-2 py-1 text-xs focus-within:border-hot">
              <Search size={12} className="text-engrave" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder={t.filter}
                aria-label={t.filter}
                className="w-44 bg-transparent text-cream placeholder:text-engrave focus:outline-none"
              />
            </label>
            <button onClick={() => void load()} disabled={loading} title={t.rescan} aria-label={t.rescan} className="rounded p-1.5 text-engrave hover:bg-rule hover:text-cream disabled:opacity-40">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </>
        )}
      </div>

      {folders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-md text-sm text-body">{t.noFolder}</p>
          <button onClick={() => void addBeatFolder()} className="flex items-center gap-2 rounded bg-hot px-4 py-2 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-chassis hover:bg-hot-hover">
            <FolderPlus size={15} /> {t.addFolder}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-3 border-b border-rule px-6 py-2 text-xs">
              <span className={picked.length ? "text-cream" : "text-engrave"}>{t.picked(picked.length)}</span>
              {picked.length > 0 && (
                <button onClick={clearPicks} className="text-engrave underline hover:text-cream">
                  {t.clear}
                </button>
              )}
              {full && <span className="text-engrave">{t.full}</span>}
            </div>
            {error && <div role="alert" className="mx-6 mt-3 rounded-md border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-cream">{error}</div>}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {loading && beats.length === 0 ? (
                <p className="p-4 text-sm text-engrave">{t.loading}</p>
              ) : shown.length === 0 ? (
                <p className="p-4 text-sm text-engrave">{t.empty}</p>
              ) : (
                <ul className="flex flex-col gap-px" aria-label={t.title}>
                  {shown.map((b) => {
                    const on = picked.includes(b.path);
                    const disabled = !on && full;
                    return (
                      <li key={b.path} className={`flex items-center gap-3 rounded px-2 py-1.5 ${on ? "bg-raised ring-1 ring-hot/40" : "hover:bg-raised"}`}>
                        <button
                          onClick={() => playToggle(b)}
                          aria-label={playing === b.path ? t.pause(b.name) : t.play(b.name)}
                          className="shrink-0 rounded-full border border-rule-strong p-1.5 text-cream hover:border-hot"
                        >
                          {playing === b.path ? <Pause size={12} /> : <Play size={12} />}
                        </button>
                        <label className={`flex min-w-0 flex-1 items-center gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                          <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(b.path)} aria-label={t.pick(b.name)} className="accent-orange-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-cream">{b.name}</span>
                            <span className="block truncate font-mono text-[10.5px] text-engrave">{b.folder}</span>
                          </span>
                        </label>
                        <span className="shrink-0 text-xs text-engrave">{formatRelative(b.modifiedAtMs)}</span>
                        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-engrave">{formatBytes(b.sizeBytes)}</span>
                        {on && <Check size={14} className="shrink-0 text-hot" aria-hidden />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <DigPanel />
        </div>
      )}
    </div>
  );
}
