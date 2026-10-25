import { useRef, useState } from "react";
import { Check, Copy, ExternalLink, FolderOpen, Pause, Play } from "lucide-react";
import { useDigger } from "../store/useDigger";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { matchBeat, youtubeId } from "../lib/digger";
import { formatRelative } from "../lib/format";
import { dict, tr } from "../i18n";
import type { BeatFile, SavedLead } from "../types";
import { ConfirmButton } from "../ui";
import { ConvertButton, LikeChip, chip, secondary } from "./DigResults";
import { NotesBox } from "./NotesBox";

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
    showFile: "Show file",
    remove: "Remove",
    confirmRemove: "Delete the lead file?",
    noLink: "The file has no https link any more.",
    link: "Video link",
    copyLink: "Copy link",
    copied: "Copied",
    copyManual: "Selected: press ⌘C / Ctrl+C",
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
    showFile: "Voir le fichier",
    remove: "Retirer",
    confirmRemove: "Supprimer le fichier de la prod ?",
    noLink: "Le fichier n'a plus de lien https.",
    link: "Lien de la vidéo",
    copyLink: "Copier le lien",
    copied: "Copié",
    copyManual: "Sélectionné : fais ⌘C / Ctrl+C",
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

/** Copying the raw video address: the button sits in the actions row (left
 * of Convert), the address itself is shown as text; when the clipboard is
 * refused the address is selected, ready for ⌘C. */
function useCopyLink(url: string) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const field = useRef<HTMLInputElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      window.setTimeout(() => setState("idle"), 3000);
    } catch {
      setState("manual");
      window.setTimeout(() => field.current?.select(), 0);
    }
  };
  return { state, field, copy };
}

/** The main action's look (orange), same shape as the other row buttons. */
const primary = "rounded bg-hot px-2.5 py-1.5 text-xs font-semibold text-chassis hover:bg-hot-hover";

function LeadRow({ lead, beat, playingBeat, onPlayBeat }: { lead: SavedLead; beat: BeatFile | null; playingBeat: string | null; onPlayBeat: (b: BeatFile) => void }) {
  const t = tr(T);
  const setPlaying = useDigger((s) => s.setPlaying);
  const deleteLead = useDigger((s) => s.deleteLead);
  const note = useAppStore((s) => s.workspace.leadNotes?.[lead.hash]);
  const setLeadNote = useAppStore((s) => s.setLeadNote);
  const id = lead.url ? youtubeId(lead.url) : null;
  const link = useCopyLink(lead.url);
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
          {lead.url ? (
            <input
              ref={link.field}
              readOnly
              value={lead.url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t.link}
              className="mt-1 w-full bg-transparent font-mono text-[11px] text-engrave focus:text-cream focus:outline-none"
            />
          ) : (
            <p className="mt-1 text-[11px] text-engrave">{t.noLink}</p>
          )}
          <div className="mt-1.5">
            <NotesBox value={note} onChange={(text) => setLeadNote(lead.hash, text)} />
          </div>
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
        {lead.url && (
          <button type="button" onClick={() => void link.copy()} aria-label={t.copyLink} className={`${primary} flex items-center gap-1`}>
            {link.state === "copied" ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
            {link.state === "copied" ? t.copied : link.state === "manual" ? t.copyManual : t.copyLink}
          </button>
        )}
        {lead.url && <ConvertButton url={lead.url} />}
        {lead.url && <LikeChip id={id ?? lead.url} title={lead.title} />}
        <button type="button" onClick={() => void api.revealInFileManager(lead.path)} className={`${secondary} flex items-center gap-1`}>
          <FolderOpen size={11} aria-hidden /> {t.showFile}
        </button>
        <ConfirmButton label={t.remove} confirmLabel={t.confirmRemove} onConfirm={() => void deleteLead(lead.path)} className="ml-auto text-xs text-engrave hover:text-missing" />
      </div>
    </li>
  );
}
