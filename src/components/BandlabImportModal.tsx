import { useEffect, useState } from "react";
import { FileAudio } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { MAX_BANDLAB_URL, cleanBandlabUrl, songNameFromFile } from "../lib/sketch";
import { formatBytes } from "../lib/format";
import type { PickedAudio } from "../types";
import { Modal, btn, btnPrimary, btnQuiet, input, sectionLabel } from "./ui";
import { dict, tr } from "../i18n";

const T = dict(
  {
    title: "Import from BandLab",
    intro: "Export the mix (or stems) from BandLab as MP3 or WAV and send it to this computer. Hivo copies it into a new song folder, as a sketch in Creation.",
    files: "Audio files",
    pick: "Pick audio files…",
    pickAgain: "Pick other files…",
    picked: (n: number, size: string) => `${n} file${n > 1 ? "s" : ""} · ${size}`,
    formats: "WAV or MP3 work best: the Launch Kit analyses WAV, MP3, OGG and FLAC.",
    name: "Song name",
    namePlaceholder: "Song title",
    clash: "Something with this name already exists there.",
    location: "Project folder",
    noFolder: "Link a project folder in Settings first.",
    openSettings: "Open Settings",
    link: "BandLab link (optional)",
    linkPlaceholder: "https://www.bandlab.com/…",
    badLink: "The link must start with https:// (300 characters max).",
    demo: "Link a real project folder to import songs.",
    cancel: "Cancel",
    importing: "Importing…",
    import: "Import",
  },
  {
    title: "Importer depuis BandLab",
    intro: "Exporte le mix (ou les stems) depuis BandLab en MP3 ou WAV et envoie-le sur cet ordi. Hivo le copie dans un nouveau dossier de son, comme sketch en Création.",
    files: "Fichiers audio",
    pick: "Choisir les fichiers audio…",
    pickAgain: "Choisir d'autres fichiers…",
    picked: (n: number, size: string) => `${n} fichier${n > 1 ? "s" : ""} · ${size}`,
    formats: "Le WAV ou le MP3 marchent le mieux : le Launch Kit analyse le WAV, le MP3, l'OGG et le FLAC.",
    name: "Nom du son",
    namePlaceholder: "Titre du son",
    clash: "Quelque chose porte déjà ce nom à cet endroit.",
    location: "Dossier de projets",
    noFolder: "Lie d'abord un dossier de projets dans les Réglages.",
    openSettings: "Ouvrir les réglages",
    link: "Lien BandLab (facultatif)",
    linkPlaceholder: "https://www.bandlab.com/…",
    badLink: "Le lien doit commencer par https:// (300 caractères max).",
    demo: "Lie un vrai dossier de projets pour importer des sons.",
    cancel: "Annuler",
    importing: "Import…",
    import: "Importer",
  },
);

export function BandlabImportModal() {
  const open = useAppStore((s) => s.bandlabImport);
  // Mounted only while open, so every opening starts from a blank form.
  return open ? <ImportForm /> : null;
}

function ImportForm() {
  const close = useAppStore((s) => s.closeBandlabImport);
  const folders = useAppStore((s) => s.settings.watchedFolders);
  const projects = useAppStore((s) => s.projects);
  const demoMode = useAppStore((s) => s.demoMode);
  const importBandlab = useAppStore((s) => s.importBandlab);
  const openDetail = useAppStore((s) => s.openDetail);
  const setView = useAppStore((s) => s.setView);
  const resetLibraryFilters = useAppStore((s) => s.resetLibraryFilters);

  const [files, setFiles] = useState<PickedAudio[]>([]);
  const [name, setName] = useState("");
  const [parentFolder, setParentFolder] = useState(folders[0] ?? "");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParentFolder((current) => (folders.includes(current) ? current : folders[0] ?? ""));
  }, [folders]);

  async function pick() {
    setError(null);
    try {
      const picked = await api.pickBandlabFiles();
      if (picked.length === 0) return; // cancelled: keep what was there
      setFiles(picked);
      setName((current) => current || songNameFromFile(picked[0].name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const trimmed = name.trim();
  const cleanLink = cleanBandlabUrl(link);
  const sep = parentFolder.includes("\\") ? "\\" : "/";
  const target = `${parentFolder.replace(/[/\\]+$/, "")}${sep}${trimmed}`.toLowerCase();
  const clash = !!trimmed && projects.some((p) => p.folder.toLowerCase() === target);
  const canImport = !demoMode && files.length > 0 && !!trimmed && !!parentFolder && cleanLink !== null && !busy;
  const L = tr(T);

  async function submit() {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    try {
      const key = await importBandlab({ parentFolder, name: trimmed, bandlabUrl: cleanLink || undefined });
      // Land where the new song shows, with no filter hiding it (as New song does).
      const view = useAppStore.getState().view;
      if (view === "settings" || view === "launch" || view === "digger") setView("library");
      resetLibraryFilters();
      openDetail(key);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const totalBytes = files.reduce((n, f) => n + f.sizeBytes, 0);

  return (
    <Modal title={L.title} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-xs leading-relaxed text-body">{L.intro}</p>

        <div>
          <div className={sectionLabel}>{L.files}</div>
          <button type="button" onClick={pick} disabled={demoMode || busy} className={`${btn} mt-1.5`}>
            <FileAudio size={14} /> {files.length ? L.pickAgain : L.pick}
          </button>
          {files.length > 0 && (
            <div className="mt-2 rounded border border-rule bg-panel px-3 py-2">
              <div className="font-mono text-[11px] text-engrave">{L.picked(files.length, formatBytes(totalBytes))}</div>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto text-xs text-cream">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex gap-2">
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="font-mono text-[11px] text-engrave">{formatBytes(f.sizeBytes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-1 text-[11px] text-engrave">{L.formats}</div>
        </div>

        <div>
          <div className={sectionLabel}>{L.name}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={L.namePlaceholder} className={`${input} mt-1.5`} />
          {clash && <div className="mt-1 text-xs text-warn">{L.clash}</div>}
        </div>

        <div>
          <div className={sectionLabel}>{L.location}</div>
          <select value={parentFolder} onChange={(e) => setParentFolder(e.target.value)} className={`${input} mt-1.5`}>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {!demoMode && folders.length === 0 && (
            <div className="mt-1 flex items-center gap-2 text-xs text-engrave">
              {L.noFolder}
              <button
                type="button"
                onClick={() => {
                  close();
                  setView("settings", "folders");
                }}
                className="underline hover:text-cream"
              >
                {L.openSettings}
              </button>
            </div>
          )}
          {trimmed && parentFolder && (
            <div className="mt-1 truncate font-mono text-[11px] text-engrave">
              {parentFolder.replace(/[/\\]+$/, "")}
              {sep}
              {trimmed}
              {sep}BandLab{sep}
            </div>
          )}
        </div>

        <div>
          <div className={sectionLabel}>{L.link}</div>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={L.linkPlaceholder}
            maxLength={MAX_BANDLAB_URL}
            className={`${input} mt-1.5`}
          />
          {cleanLink === null && <div className="mt-1 text-xs text-warn">{L.badLink}</div>}
        </div>

        {demoMode && <div className="text-xs text-warn">{L.demo}</div>}
        {error && <div className="rounded border border-missing/30 bg-missing/10 px-3 py-2 text-xs text-missing">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className={btnQuiet}>
            {L.cancel}
          </button>
          <button type="submit" disabled={!canImport} className={btnPrimary}>
            {busy ? L.importing : L.import}
          </button>
        </div>
      </form>
    </Modal>
  );
}
