import { ExternalLink, FolderOpen, Pause, Play } from "lucide-react";
import { useDigger } from "../store/useDigger";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { converterLink, matchBeat, youtubeId } from "../lib/digger";
import { formatRelative } from "../lib/format";
import { dict, tr } from "../i18n";
import type { BeatFile, SavedLead } from "../types";
import { ConfirmButton } from "../ui";
import { LikeChip, chip, secondary } from "./DigResults";

// The Digger's "Saved prods" tab: every lead saved with "Save to Prods"
// (the text files in the beats folders' `_leads`), newest first, with the
// facts read back from the file. A lead plays again in the docked YouTube
// player; a file in the beats folders whose name matches the title is shown
// as "In your prods" and plays locally. Nothing here downloads anything.

const T = dict(
  {
    title: "Saved prods",
    empty: "Nothing saved yet. \"Save to Prods\" on a result keeps its link and facts here, across sessions.",
    downloadedHint: "A beat you downloaded into a beats folder shows up as \"In your prods\" when its file name matches the title.",
    inProds: "In your prods",
    playBeat: (name: string) => `Play ${name}`,
    pauseBeat: (name: string) => `Pause ${name}`,
    play: "Play",
    playTitle: (title: string) => `Play ${title}`,
    open: "Open",
    openTitle: (title: string) => `Open ${title} in the browser`,
    convert: "Convert",
    convertTitle: "Opens your converter link in the browser with this video's address. The site, its terms and the file are between you and it.",
    showFile: "Show file",
    remove: "Remove",
    confirmRemove: "Delete the lead file?",
    noLink: "The file has no https link any more.",
    savedOn: (when: string) => `Saved ${when}`,
    bpm: (n: number) => `${Math.round(n)} BPM`,
  },
  {
    title: "Prods enregistrées",
    empty: "Rien d'enregistré pour l'instant. « Garder dans mes prods » sur un résultat garde son lien et ses infos ici, d'une session à l'autre.",
    downloadedHint: "Une prod que tu as téléchargée dans un dossier de prods apparaît comme « Dans tes prods » quand le nom du fichier correspond au titre.",
    inProds: "Dans tes prods",
    playBeat: (name: string) => `Écouter ${name}`,
    pauseBeat: (name: string) => `Pause ${name}`,
    play: "Écouter",
    playTitle: (title: string) => `Écouter ${title}`,
    open: "Ouvrir",
    openTitle: (title: string) => `Ouvrir ${title} dans le navigateur`,
    convert: "Convertir",
    convertTitle: "Ouvre ton lien de conversion dans le navigateur avec l'adresse de cette vidéo. Le site, ses conditions et le fichier, c'est entre toi et lui.",
    showFile: "Voir le fichier",
    remove: "Retirer",
    confirmRemove: "Supprimer le fichier de la prod ?",
    noLink: "Le fichier n'a plus de lien https.",
    savedOn: (when: string) => `Enregistrée ${when}`,
    bpm: (n: number) => `${Math.round(n)} BPM`,
  },
);

interface Props {
  beats: BeatFile[];
  /** The beat the Digger's own audio element is playing (its path). */
  playingBeat: string | null;
  onPlayBeat: (beat: BeatFile) => void;
}

export function SavedLeads({ beats, playingBeat, onPlayBeat }: Props) {
  const t = tr(T);
  const leads = useDigger((s) => s.leads);
  const leadError = useDigger((s) => s.leadError);

  return (
    <div className="flex flex-col gap-2" aria-label={t.title}>
      {leadError && <div role="alert" className="rounded-md border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-cream">{leadError}</div>}
      {leads.length === 0 ? (
        <p className="p-4 text-sm text-engrave">{t.empty}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {leads.map((lead) => (
              <LeadRow key={lead.path} lead={lead} beat={matchBeat(lead, beats)} playingBeat={playingBeat} onPlayBeat={onPlayBeat} />
            ))}
          </ul>
          <p className="px-1 text-[11px] text-engrave">{t.downloadedHint}</p>
        </>
      )}
    </div>
  );
}

function LeadRow({ lead, beat, playingBeat, onPlayBeat }: { lead: SavedLead; beat: BeatFile | null; playingBeat: string | null; onPlayBeat: (b: BeatFile) => void }) {
  const t = tr(T);
  const setPlaying = useDigger((s) => s.setPlaying);
  const deleteLead = useDigger((s) => s.deleteLead);
  const converter = useAppStore((s) => s.settings.converterUrlTemplate);
  const id = lead.url ? youtubeId(lead.url) : null;
  const convert = lead.url ? converterLink(converter, lead.url) : null;
  const facts = [
    lead.producer,
    lead.year,
    lead.bpm != null ? t.bpm(lead.bpm) : "",
    lead.key ?? "",
    t.savedOn(lead.savedOn || formatRelative(lead.modifiedAtMs)),
  ].filter(Boolean);
  const localPlaying = !!beat && playingBeat === beat.path;

  return (
    <li className="flex flex-col gap-1.5 rounded border border-rule bg-panel px-3 py-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-cream" title={lead.title}>
              {lead.title}
            </span>
            {beat && (
              <span className={`${chip(true)} shrink-0 whitespace-nowrap`} title={beat.path}>
                {t.inProds}
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-engrave">{facts.join(" · ")}</div>
          {lead.traits.length > 0 && <div className="truncate text-[11px] text-body">{lead.traits.join(" · ")}</div>}
          {lead.summary && <p className="mt-1 line-clamp-2 text-xs text-body">{lead.summary}</p>}
          {!lead.url && <p className="mt-1 text-[11px] text-engrave">{t.noLink}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {beat && (
          <button
            type="button"
            onClick={() => onPlayBeat(beat)}
            aria-label={localPlaying ? t.pauseBeat(beat.name) : t.playBeat(beat.name)}
            title={beat.name}
            className="shrink-0 rounded-full border border-rule-strong p-1.5 text-cream hover:border-hot"
          >
            {localPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
        )}
        {id && (
          <button type="button" onClick={() => setPlaying({ id, title: lead.title })} aria-label={t.playTitle(lead.title)} className={`${secondary} flex items-center gap-1`}>
            <Play size={11} aria-hidden /> {t.play}
          </button>
        )}
        {lead.url && (
          <button type="button" onClick={() => void api.openExternal(lead.url)} aria-label={t.openTitle(lead.title)} className={`${secondary} flex items-center gap-1`}>
            <ExternalLink size={11} aria-hidden /> {t.open}
          </button>
        )}
        {convert && (
          <button type="button" onClick={() => void api.openExternal(convert)} title={t.convertTitle} className={secondary}>
            {t.convert}
          </button>
        )}
        {lead.url && <LikeChip id={id ?? lead.url} title={lead.title} />}
        <button type="button" onClick={() => void api.revealInFileManager(lead.path)} className={`${secondary} flex items-center gap-1`}>
          <FolderOpen size={11} aria-hidden /> {t.showFile}
        </button>
        <ConfirmButton label={t.remove} confirmLabel={t.confirmRemove} onConfirm={() => void deleteLead(lead.path)} className="ml-auto text-xs text-engrave hover:text-missing" />
      </div>
    </li>
  );
}
