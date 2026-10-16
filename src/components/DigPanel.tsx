import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { useDigger } from "../store/useDigger";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { MAX_QUERY_CHARS, beatQuery, youtubeSearchUrl } from "../lib/digger";
import { dict, tr } from "../i18n";
import type { YoutubeStatus } from "../types";

// The right side of the Digger: the picked beats, then the dig: searches
// built from them, YouTube results (with a key) and links that always work.
// Links only: nothing is ever downloaded (docs/GUARDRAILS.md).

const NB = " ";
const T = dict(
  {
    title: "Picked",
    none: "Pick the beats that have the vibe you want (up to 5).",
    dig: "Find similar beats",
    ideas: "Searches from your picks",
    search: "Search",
    searchLabel: "Search YouTube for beats",
    placeholder: "e.g. dark trap type beat",
    open: "Open on YouTube",
    searching: "Searching…",
    noResults: "No results. Try other words.",
    noKey: "Add a YouTube key in Settings to see results here. The button opens the search in your browser.",
    setUp: "Settings",
    openVideo: (title: string) => `Open ${title} on YouTube`,
    hint: "Opens in your browser. Leasing a beat stays between you and the producer: the Digger downloads nothing.",
  },
  {
    title: "Choisies",
    none: "Choisis les prods qui ont le vibe que tu cherches (5 max).",
    dig: "Trouver des prods proches",
    ideas: "Recherches tirées de tes choix",
    search: "Chercher",
    searchLabel: "Chercher des prods sur YouTube",
    placeholder: "ex. dark trap type beat",
    open: "Ouvrir sur YouTube",
    searching: "Recherche…",
    noResults: "Aucun résultat. Essaie d'autres mots.",
    noKey: "Ajoute une clé YouTube dans les Réglages pour voir les résultats ici. Le bouton ouvre la recherche dans ton navigateur.",
    setUp: "Réglages",
    openVideo: (title: string) => `Ouvrir ${title} sur YouTube`,
    hint: `S'ouvre dans ton navigateur. La licence d'une prod se règle entre toi et le beatmaker${NB}: le Digger ne télécharge rien.`,
  },
);

export function DigPanel() {
  const t = tr(T);
  const { picked, beats, webQuery, results, searching, searchError, searchedFor, setWebQuery, searchYoutube } = useDigger();
  const setView = useAppStore((s) => s.setView);
  const [yt, setYt] = useState<YoutubeStatus | null>(null);
  const byPath = useMemo(() => new Map(beats.map((b) => [b.path, b])), [beats]);
  const ideas = useMemo(() => {
    const qs = picked.map((p) => beatQuery(byPath.get(p)?.name ?? "")).filter(Boolean);
    return [...new Set(qs.map((q) => q.toLowerCase()))].map((l) => qs.find((q) => q.toLowerCase() === l)!);
  }, [picked, byPath]);

  useEffect(() => {
    let live = true;
    api.youtubeStatus().then((s) => live && setYt(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const q = webQuery.trim();
  const run = (query: string) => {
    setWebQuery(query);
    if (yt?.configured && query.trim()) void searchYoutube(query);
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-rule p-4" aria-label={t.title}>
      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">{t.title}</h2>
      {picked.length === 0 ? (
        <p className="text-sm text-engrave">{t.none}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {picked.map((p, i) => (
            <li key={p} className="flex items-center gap-2 text-sm">
              <span className="w-4 font-mono text-[11px] text-engrave">{i + 1}</span>
              <span className="truncate text-cream">{byPath.get(p)?.name ?? p}</span>
            </li>
          ))}
        </ol>
      )}

      <section aria-label={t.dig} className="mt-2 flex flex-col gap-2 border-t border-rule pt-3">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">{t.dig}</h2>
        {ideas.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label={t.ideas}>
            {ideas.map((idea) => (
              <button
                key={idea}
                onClick={() => run(idea)}
                className={`rounded border px-2 py-0.5 text-left text-xs ${idea === q ? "border-cream bg-cream text-chassis" : "border-rule-strong text-body hover:border-cream"}`}
              >
                {idea}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            run(webQuery);
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-rule bg-chassis px-2 py-1.5 text-xs focus-within:border-hot">
            <Search size={12} className="shrink-0 text-engrave" aria-hidden />
            <input
              value={webQuery}
              onChange={(e) => setWebQuery(e.target.value)}
              maxLength={MAX_QUERY_CHARS}
              placeholder={t.placeholder}
              aria-label={t.searchLabel}
              className="min-w-0 flex-1 bg-transparent text-cream placeholder:text-engrave focus:outline-none"
            />
          </label>
          {yt?.configured && (
            <button type="submit" disabled={!q || searching} className="rounded bg-hot px-2.5 py-1.5 text-xs font-semibold text-chassis hover:bg-hot-hover disabled:opacity-40">
              {t.search}
            </button>
          )}
          <button
            type="button"
            onClick={() => void api.openExternal(youtubeSearchUrl(q))}
            disabled={!q}
            title={t.open}
            aria-label={t.open}
            className="flex items-center gap-1 rounded border border-rule-strong px-2 py-1.5 text-xs text-body hover:border-cream disabled:opacity-40"
          >
            <ExternalLink size={12} aria-hidden /> {yt?.configured ? "" : t.open}
          </button>
        </form>
        {yt && !yt.configured && (
          <p className="text-[11px] leading-relaxed text-engrave">
            {t.noKey}{" "}
            <button onClick={() => setView("settings")} className="underline hover:text-cream">
              {t.setUp}
            </button>
          </p>
        )}
        {searchError && <div role="alert" className="rounded-md border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-cream">{searchError}</div>}
        {searching && <p className="text-xs text-engrave">{t.searching}</p>}
        {!searching && searchedFor !== null && searchedFor === q && results.length === 0 && <p className="text-xs text-engrave">{t.noResults}</p>}
        {results.length > 0 && (
          <ul className="flex flex-col gap-1" aria-label="YouTube">
            {results.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => void api.openExternal(v.url)}
                  aria-label={t.openVideo(v.title)}
                  className="flex w-full items-center gap-2.5 rounded p-1 text-left hover:bg-raised"
                >
                  <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} className="h-[45px] w-20 shrink-0 rounded-sm bg-raised object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs text-cream">{v.title}</span>
                    <span className="block truncate font-mono text-[10.5px] text-engrave">
                      {v.channel}
                      {v.publishedAt ? ` · ${v.publishedAt.slice(0, 4)}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-engrave">{t.hint}</p>
      </section>
    </aside>
  );
}
