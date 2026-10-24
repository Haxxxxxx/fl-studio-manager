import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Search, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { dict, tr } from "../i18n";
import type { LookupCandidate, Person, PlatformLink, SpotifyStatus } from "../types";
import { btn, btnPrimary, input, sectionLabel } from "./ui";

// A person's streaming and social profiles, with the IDs distributors ask
// for (Spotify artist ID, Apple Music ID…). "Look up profiles" searches
// MusicBrainz (keyless) and, with credentials in Settings, Spotify; the user
// picks the right artist and the profiles are stored on the person (local
// only, never shared with the crew). All requests run in Rust (lookup.rs).

const T = dict(
  {
    title: "Profiles",
    lookUp: "Look up profiles",
    lookUpAgain: "Look up again",
    none: "No profiles yet. Look them up to get the links and IDs distributors ask for (Spotify artist ID, Apple Music…).",
    searchPlaceholder: "Artist name",
    search: "Search",
    searching: "Searching…",
    noResults: "No artist found with that name. Try another spelling.",
    pick: "Use",
    picking: "Fetching…",
    cancel: "Cancel",
    source: (s: string) => (s === "spotify" ? "Spotify" : "MusicBrainz"),
    followers: (n: number) => `${new Intl.NumberFormat().format(n)} followers`,
    popularity: (n: number) => `popularity ${n}/100`,
    spotifyOff: "Spotify search and stats need app credentials:",
    spotifySettings: "add them in Settings",
    spotifyOffShort: "Spotify stats need credentials in Settings.",
    lookedUp: (when: string) => `Looked up ${when}`,
    copyId: "Copy ID",
    copyLink: "Copy link",
    copied: "Copied",
    open: "Open",
    streaming: "Streaming",
    social: "Social",
    other: "Other",
    via: (s: string) => `via ${s === "musicbrainz" ? "MusicBrainz" : s === "deezer" ? "Deezer" : "iTunes"}`,
  },
  {
    title: "Profils",
    lookUp: "Chercher les profils",
    lookUpAgain: "Chercher à nouveau",
    none: "Pas encore de profil. Cherche-les pour avoir les liens et les identifiants que demandent les distributeurs (ID artiste Spotify, Apple Music…).",
    searchPlaceholder: "Nom d'artiste",
    search: "Chercher",
    searching: "Recherche…",
    noResults: "Aucun artiste à ce nom. Essaie une autre orthographe.",
    pick: "Utiliser",
    picking: "Récupération…",
    cancel: "Annuler",
    source: (s: string) => (s === "spotify" ? "Spotify" : "MusicBrainz"),
    followers: (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} abonnés`,
    popularity: (n: number) => `popularité ${n}/100`,
    spotifyOff: "La recherche et les stats Spotify demandent des identifiants d'appli :",
    spotifySettings: "ajoute-les dans Réglages",
    spotifyOffShort: "Les stats Spotify demandent des identifiants dans Réglages.",
    lookedUp: (when: string) => `Cherché le ${when}`,
    copyId: "Copier l'ID",
    copyLink: "Copier le lien",
    copied: "Copié",
    open: "Ouvrir",
    streaming: "Streaming",
    social: "Réseaux",
    other: "Autres",
    via: (s: string) => `via ${s === "musicbrainz" ? "MusicBrainz" : s === "deezer" ? "Deezer" : "iTunes"}`,
  },
);

const CATEGORIES: PlatformLink["category"][] = ["streaming", "social", "other"];

export function Profiles({ person }: { person: Person }) {
  const t = tr(T);
  const updatePerson = useAppStore((s) => s.updatePerson);
  const setView = useAppStore((s) => s.setView);
  const [open, setOpen] = useState(false);
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const links = person.links ?? [];

  useEffect(() => {
    let live = true;
    api.spotifyStatus().then((s) => live && setSpotify(s)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center gap-3">
        <div className={sectionLabel}>{t.title}</div>
        {person.lookedUpAt && <span className="text-[11px] text-engrave">{t.lookedUp(person.lookedUpAt.slice(0, 10))}</span>}
        <button onClick={() => setOpen(!open)} className={`${btn} ml-auto text-xs`}>
          <Search size={12} /> {links.length ? t.lookUpAgain : t.lookUp}
        </button>
      </div>

      {open && (
        <LookupPanel
          name={person.name}
          spotifyConfigured={!!spotify?.configured}
          onSettings={() => setView("settings", "spotify")}
          onPicked={(profile) => {
            updatePerson(person.id, { mbid: profile.mbid, links: profile.links, spotify: profile.spotify, lookedUpAt: new Date().toISOString() });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}

      {links.length === 0 && !open && <p className="text-xs text-engrave">{t.none}</p>}

      {person.spotify && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-rule bg-panel px-3 py-2">
          {person.spotify.imageUrl && <img src={person.spotify.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />}
          <div className="min-w-0 text-xs text-body">
            <div className="text-cream">
              {t.followers(person.spotify.followers)} · {t.popularity(person.spotify.popularity)}
            </div>
            {person.spotify.genres.length > 0 && <div className="truncate text-engrave">{person.spotify.genres.join(" · ")}</div>}
          </div>
        </div>
      )}
      {!person.spotify && links.some((l) => l.platform === "spotify") && !spotify?.configured && (
        <p className="mb-2 text-[11px] text-engrave">
          {t.spotifyOffShort}{" "}
          <button onClick={() => setView("settings", "spotify")} className="text-body underline-offset-2 hover:text-cream hover:underline">
            {t.spotifySettings}
          </button>
        </p>
      )}

      {CATEGORIES.map((cat) => {
        const group = links.filter((l) => l.category === cat);
        if (group.length === 0) return null;
        return (
          <div key={cat} className="mb-3">
            <div className="mb-1 text-[10.5px] uppercase tracking-[0.14em] text-engrave">{t[cat]}</div>
            <div className="overflow-hidden rounded-lg border border-rule">
              {group.map((l) => (
                <LinkRow key={`${l.platform}:${l.id ?? l.url}`} link={l} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LinkRow({ link }: { link: PlatformLink }) {
  const t = tr(T);
  const [copied, setCopied] = useState<"id" | "link" | null>(null);
  const copy = async (what: "id" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "id" ? (link.id ?? "") : link.url);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // The address stays readable in the row; nothing else to do.
    }
  };
  return (
    <div className="flex items-center gap-3 border-b border-rule px-3 py-2 text-xs last:border-0">
      <span className="w-28 shrink-0 truncate text-cream" title={link.url}>
        {link.label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-engrave" title={link.url}>
        {link.id ?? link.url}
      </span>
      {link.source !== "musicbrainz" && <span className="shrink-0 text-[10px] text-engrave">{t.via(link.source)}</span>}
      {link.id && (
        <button onClick={() => void copy("id")} className="flex shrink-0 items-center gap-1 text-body hover:text-cream" title={t.copyId}>
          {copied === "id" ? <Check size={11} /> : <Copy size={11} />} {copied === "id" ? t.copied : t.copyId}
        </button>
      )}
      <button onClick={() => void copy("link")} className="flex shrink-0 items-center gap-1 text-body hover:text-cream" title={t.copyLink}>
        {copied === "link" ? <Check size={11} /> : <Copy size={11} />} {copied === "link" ? t.copied : t.copyLink}
      </button>
      <button onClick={() => void api.openExternal(link.url)} className="flex shrink-0 items-center gap-1 text-body hover:text-cream" title={link.url}>
        <ExternalLink size={11} /> {t.open}
      </button>
    </div>
  );
}

function LookupPanel({
  name,
  spotifyConfigured,
  onSettings,
  onPicked,
  onClose,
}: {
  name: string;
  spotifyConfigured: boolean;
  onSettings: () => void;
  onPicked: (profile: Awaited<ReturnType<typeof api.lookupProfile>>) => void;
  onClose: () => void;
}) {
  const t = tr(T);
  const [query, setQuery] = useState(name);
  const [candidates, setCandidates] = useState<LookupCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setError(null);
    try {
      setCandidates(await api.lookupArtists(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  // The person's name is the obvious first search.
  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (c: LookupCandidate) => {
    setPicking(`${c.source}:${c.id}`);
    setError(null);
    try {
      onPicked(await api.lookupProfile(c.source, c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  };

  return (
    <div className="mb-3 rounded-md border border-rule-strong bg-raised p-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.searchPlaceholder} maxLength={120} className={`${input} py-1.5 text-xs`} />
        <button type="submit" disabled={searching || query.trim().length < 2} className={`${btnPrimary} text-xs`}>
          {searching ? t.searching : t.search}
        </button>
        <button type="button" onClick={onClose} aria-label={t.cancel} className="rounded p-1 text-engrave hover:bg-rule hover:text-cream">
          <X size={14} />
        </button>
      </form>
      {!spotifyConfigured && (
        <p className="mt-2 text-[11px] text-engrave">
          {t.spotifyOff}{" "}
          <button type="button" onClick={onSettings} className="text-body underline-offset-2 hover:text-cream hover:underline">
            {t.spotifySettings}
          </button>
        </p>
      )}
      {error && <div role="alert" className="mt-2 rounded-md border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-cream">{error}</div>}
      {candidates && candidates.length === 0 && !searching && <p className="mt-2 text-xs text-engrave">{t.noResults}</p>}
      {candidates && candidates.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {candidates.map((c) => {
            const key = `${c.source}:${c.id}`;
            const facts = [c.disambiguation, c.country, c.kind, c.followers != null ? t.followers(c.followers) : ""].filter(Boolean).join(" · ");
            return (
              <li key={key} className="flex items-center gap-3 rounded px-2 py-1.5 text-xs hover:bg-panel">
                <span className="w-20 shrink-0 rounded bg-rule px-1.5 py-px text-center text-[10px] text-body">{t.source(c.source)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-cream">{c.name}</span>
                  {facts && <span className="block truncate text-[11px] text-engrave">{facts}</span>}
                </span>
                <button type="button" onClick={() => void pick(c)} disabled={picking !== null} className={`${btn} text-xs`}>
                  {picking === key ? t.picking : t.pick}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
