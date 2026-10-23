import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, Sparkles } from "lucide-react";
import { digIsStale, useDigger } from "../store/useDigger";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { MAX_QUERY_CHARS, beatFactsLine, beatQuery, googleSearchUrl, youtubeSearchUrl } from "../lib/digger";
import { currentLang, dict, tr } from "../i18n";
import type { YoutubeStatus } from "../types";

// The right side of the Digger: the picked beats, the AI dig (what they
// share, searches, beats found on the web), then the YouTube search.
// Links only: nothing is ever downloaded (docs/GUARDRAILS.md).

const NB = " ";
const T = dict(
  {
    title: "Picked",
    none: "Pick the beats that have the vibe you want (up to 5).",
    dig: "Dig",
    digging: "Listening and digging…",
    digTitle: "What they share",
    needAi: "The dig uses Gemini (free). Add a key in",
    listen: "Let Gemini listen (30 seconds of each beat)",
    disclosure: (audio: boolean) =>
      "Sends the beats' file names, tempo, key, loudness and length to Google Gemini" +
      (audio ? ", plus a 30-second, low-quality excerpt of each beat" : "") +
      `. Never file paths${audio ? "" : " or audio"}. On the free tier Google may use what it receives to improve its products.`,
    stale: "Your picks changed since this dig. Dig again to update it.",
    heard: "Gemini listened to the excerpts.",
    aiSearches: "Searches from the dig",
    web: "Found on the web",
    googled: "Google searches behind these links",
    openLink: (site: string) => `Open ${site}`,
    find: "Find similar beats",
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
    dig: "Creuser",
    digging: "Écoute et recherche…",
    digTitle: "Ce qu'elles ont en commun",
    needAi: "Le Digger utilise Gemini (gratuit). Ajoute une clé dans les",
    listen: "Faire écouter à Gemini (30 secondes de chaque prod)",
    disclosure: (audio: boolean) =>
      "Envoie à Google Gemini le nom des fichiers, le tempo, la tonalité, le volume et la durée des prods" +
      (audio ? ", plus un extrait de 30 secondes, en basse qualité, de chaque prod" : "") +
      `. Jamais les chemins de fichiers${audio ? "" : " ni l'audio"}. Avec l'offre gratuite, Google peut utiliser ce qu'il reçoit pour améliorer ses produits.`,
    stale: "Tes choix ont changé depuis. Creuse à nouveau pour mettre à jour.",
    heard: "Gemini a écouté les extraits.",
    aiSearches: "Recherches tirées de l'analyse",
    web: "Trouvé sur le web",
    googled: "Recherches Google derrière ces liens",
    openLink: (site: string) => `Ouvrir ${site}`,
    find: "Trouver des prods proches",
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

const label = "font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave";
const chip = (on: boolean) =>
  `rounded border px-2 py-0.5 text-left text-xs ${on ? "border-cream bg-cream text-chassis" : "border-rule-strong text-body hover:border-cream"}`;

export function DigPanel() {
  const t = tr(T);
  const d = useDigger();
  const { picked, beats, webQuery, results, searching, searchError, searchedFor, setWebQuery, searchYoutube } = d;
  const setView = useAppStore((s) => s.setView);
  const aiStatus = useAppStore((s) => s.aiStatus);
  const sendAudio = useAppStore((s) => !!s.settings.digSendAudio);
  const updateSettings = useAppStore((s) => s.updateSettings);
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
  const dig = d.dig;
  const stale = !!dig && digIsStale(picked, d.dugFor);

  return (
    <aside className="flex min-h-0 w-[clamp(320px,38%,460px)] shrink-0 flex-col gap-3 overflow-y-auto border-l border-rule p-4" aria-label={t.title}>
      <h2 className={label}>{t.title}</h2>
      {picked.length === 0 ? (
        <p className="text-sm text-engrave">{t.none}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {picked.map((p, i) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <span className="w-4 shrink-0 pt-0.5 font-mono text-[11px] text-engrave">{i + 1}</span>
              <span title={byPath.get(p)?.name ?? p} className="line-clamp-2 min-w-0 break-words text-cream">{byPath.get(p)?.name ?? p}</span>
            </li>
          ))}
        </ol>
      )}

      {picked.length > 0 && (
        <div className="flex flex-col gap-2">
          {aiStatus && !aiStatus.configured ? (
            <p className="text-[11px] leading-relaxed text-engrave">
              {t.needAi}{" "}
              <button onClick={() => setView("settings")} className="underline hover:text-cream">
                {t.setUp}
              </button>
              .
            </p>
          ) : (
            <button
              onClick={() => void d.runDig(currentLang(), !!yt?.configured)}
              disabled={d.digging}
              className="flex items-center justify-center gap-2 rounded bg-hot px-4 py-2 font-display text-[15px] font-bold uppercase tracking-[0.06em] text-chassis hover:bg-hot-hover disabled:opacity-50"
            >
              <Sparkles size={15} aria-hidden /> {d.digging ? t.digging : t.dig}
            </button>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-xs text-body">
            <input type="checkbox" checked={sendAudio} onChange={(e) => void updateSettings({ digSendAudio: e.target.checked })} className="mt-0.5 accent-orange-500" />
            {t.listen}
          </label>
          <p className="text-[11px] leading-relaxed text-engrave">{t.disclosure(sendAudio)}</p>
          {d.digError && <div role="alert" className="rounded-md border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-cream">{d.digError}</div>}
        </div>
      )}

      {dig && (
        <section aria-label={t.digTitle} className="flex flex-col gap-2 border-t border-rule pt-3">
          <h2 className={label}>{t.digTitle}</h2>
          {stale && <p className="text-[11px] text-warn">{t.stale}</p>}
          <p className="text-sm leading-relaxed text-cream">{dig.analysis.summary}</p>
          {(dig.analysis.traits.length > 0 || dig.analysis.tempo) && (
            <ul className="flex flex-wrap gap-1.5">
              {dig.analysis.tempo && <li className="rounded bg-raised px-2 py-0.5 font-mono text-[11px] text-cream">{dig.analysis.tempo}</li>}
              {dig.analysis.traits.map((tag) => (
                <li key={tag} className="rounded bg-raised px-2 py-0.5 text-[11px] text-body">
                  {tag}
                </li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col gap-0.5">
            {dig.beats.map((b, i) => (
              <li key={i} className="flex gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-engrave">{b.name}</span>
                <span className="shrink-0 font-mono text-body">{beatFactsLine(b)}</span>
              </li>
            ))}
          </ul>
          {dig.audioSent && <p className="text-[11px] text-engrave">{t.heard}</p>}
          {dig.analysis.queries.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label={t.aiSearches}>
              {dig.analysis.queries.map((s) => (
                <button key={s} onClick={() => run(s)} className={chip(s === q)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <h3 className={`${label} mt-1`}>{t.web}</h3>
          {dig.web.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label={t.web}>
              {dig.web.map((l) => (
                <li key={l.url}>
                  <button onClick={() => void api.openExternal(l.url)} aria-label={t.openLink(l.site || l.text)} className="flex w-full items-start gap-2 rounded p-1 text-left hover:bg-raised">
                    <ExternalLink size={12} className="mt-0.5 shrink-0 text-engrave" aria-hidden />
                    <span className="min-w-0 flex-1">
                      {l.text && <span className="line-clamp-2 text-xs text-cream">{l.text}</span>}
                      <span className="block truncate font-mono text-[10.5px] text-engrave">{l.site}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dig.webError && <p className="text-[11px] text-engrave">{dig.webError}</p>}
          {dig.webSearches.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label={t.googled}>
              <span className="text-[11px] text-engrave">Google:</span>
              {dig.webSearches.map((s) => (
                <button key={s} onClick={() => void api.openExternal(googleSearchUrl(s))} className={chip(false)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section aria-label={t.find} className="flex flex-col gap-2 border-t border-rule pt-3">
        <h2 className={label}>{t.find}</h2>
        {ideas.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label={t.ideas}>
            {ideas.map((idea) => (
              <button key={idea} onClick={() => run(idea)} className={chip(idea === q)}>
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
            <button type="submit" disabled={!q || searching} className="rounded border border-rule-strong px-2.5 py-1.5 text-xs font-semibold text-cream hover:border-cream disabled:opacity-40">
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
                  <img
                    src={v.thumbnail}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                    className="h-[45px] w-20 shrink-0 rounded-sm bg-raised object-cover"
                  />
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
