import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { STATUSES } from "../lib/songs";
import type { SongStatus, TemplateInfo } from "../types";
import { Modal, btn, btnPrimary, input, sectionLabel } from "./ui";
import { dict, tr } from "../i18n";

const T = dict(
  {
    openFailed: (name: string, err: string) => `Created ${name}, but it didn't open: ${err}. Open it from the song panel.`,
    title: "New song",
    name: "Name",
    namePlaceholder: "Song title",
    clash: "A song with this name already exists there.",
    startFrom: "Start from",
    chooseTemplate: "Choose a template…",
    yourTemplates: "Your templates",
    noTemplates:
      "No templates found. Save any project into a Templates folder inside a linked folder to start new songs from it.",
    setFlPath: "Set the FL Studio path in Settings to see its templates.",
    location: "Location",
    stage: "Stage",
    release: "Release",
    none: "None",
    openAfter: "Open in FL Studio after creating",
    demo: "Link a real project folder to create songs.",
    noFolder: "Link a project folder in Settings first.",
    openSettings: "Open Settings",
    cancel: "Cancel",
    creating: "Creating…",
    create: "Create song",
  },
  {
    openFailed: (name: string, err: string) =>
      `${name} est créé, mais il ne s'est pas ouvert : ${err}. Ouvre-le depuis le panneau du son.`,
    title: "Nouveau son",
    name: "Nom",
    namePlaceholder: "Titre du son",
    clash: "Un son avec ce nom existe déjà à cet endroit.",
    startFrom: "Partir de",
    chooseTemplate: "Choisis un template…",
    yourTemplates: "Tes templates",
    noTemplates:
      "Aucun template trouvé. Enregistre un projet dans un dossier Templates à l'intérieur d'un dossier lié pour démarrer des sons à partir de lui.",
    setFlPath: "Indique le chemin de FL Studio dans les Réglages pour voir ses templates.",
    location: "Emplacement",
    stage: "Étape",
    release: "Sortie",
    none: "Aucune",
    openAfter: "Ouvrir dans FL Studio après la création",
    demo: "Lie un vrai dossier de projets pour créer des sons.",
    noFolder: "Lie d'abord un dossier de projets dans les Réglages.",
    openSettings: "Ouvrir les réglages",
    cancel: "Annuler",
    creating: "Création…",
    create: "Créer le son",
  },
);

export function NewProjectModal() {
  const draft = useAppStore((s) => s.newProject);
  const close = useAppStore((s) => s.closeNewProject);
  const settings = useAppStore((s) => s.settings);
  const projects = useAppStore((s) => s.projects);
  const albums = useAppStore((s) => s.workspace.albums);
  const demoMode = useAppStore((s) => s.demoMode);
  const createProject = useAppStore((s) => s.createProject);
  const openDetail = useAppStore((s) => s.openDetail);
  const setView = useAppStore((s) => s.setView);
  const resetLibraryFilters = useAppStore((s) => s.resetLibraryFilters);

  const [name, setName] = useState("");
  const [factory, setFactory] = useState<TemplateInfo[]>([]);
  const [templatePath, setTemplatePath] = useState("");
  const [parentFolder, setParentFolder] = useState(settings.watchedFolders[0] ?? "");
  const [status, setStatus] = useState<SongStatus>(draft?.status ?? "creation");
  const [albumId, setAlbumId] = useState<string>(draft?.albumId ?? "");
  const [openAfter, setOpenAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userTemplates = useMemo(() => projects.filter((p) => p.isTemplate), [projects]);

  // The modal stays mounted: re-pick the location each time it opens, so a
  // folder linked (or removed) since the app started is reflected.
  const folders = settings.watchedFolders;
  useEffect(() => {
    if (!draft) return;
    setParentFolder((current) => (folders.includes(current) ? current : folders[0] ?? ""));
    setError(null);
  }, [draft, folders]);

  // Apply the draft once per opening (a new draft object each time). Not on
  // every rescan: a window-focus scan must not reset the stage and release
  // picked meanwhile.
  useEffect(() => {
    if (!draft) return;
    setStatus(draft.status);
    setAlbumId(draft.albumId ?? "");
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    Promise.all([api.listTemplates(), api.defaultTemplate()])
      .then(([list, fallback]) => {
        if (cancelled) return;
        setFactory(list);
        const userTemplate = useAppStore.getState().projects.find((p) => p.isTemplate)?.path;
        setTemplatePath((current) => current || fallback || userTemplate || list[0]?.path || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft, settings.flStudioPath]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, TemplateInfo[]>();
    for (const t of factory) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
    return [...groups.entries()];
  }, [factory]);

  if (!draft) return null;

  const trimmed = name.trim();
  const clash = projects.some(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase() && p.folder.toLowerCase().startsWith(parentFolder.toLowerCase()),
  );
  const canCreate = !demoMode && trimmed && templatePath && parentFolder && !busy;

  async function submit() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    try {
      const path = await createProject({
        name: trimmed,
        templatePath,
        parentFolder,
        albumId: albumId || null,
        status,
      });
      setName("");
      // Land where the new song shows: the Library (no drawer on Settings or
      // the Launch Kit), with no filter hiding it.
      if (useAppStore.getState().view === "settings" || useAppStore.getState().view === "launch") setView("library");
      resetLibraryFilters();
      openDetail(path);
      if (openAfter) {
        try {
          await api.openInFlStudio(path);
        } catch (e) {
          // The song exists; say so here instead of on a closed modal.
          setError(tr(T).openFailed(trimmed, e instanceof Error ? e.message : String(e)));
          return;
        }
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sep = parentFolder.includes("\\") ? "\\" : "/";
  const L = tr(T);

  return (
    <Modal title={L.title} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <div className={sectionLabel}>{L.name}</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={L.namePlaceholder} className={`${input} mt-1.5`} />
          {clash && <div className="mt-1 text-xs text-amber-400">{L.clash}</div>}
        </div>

        <div>
          <div className={sectionLabel}>{L.startFrom}</div>
          <select value={templatePath} onChange={(e) => setTemplatePath(e.target.value)} className={`${input} mt-1.5`}>
            {!templatePath && <option value="">{L.chooseTemplate}</option>}
            {userTemplates.length > 0 && (
              <optgroup label={L.yourTemplates}>
                {userTemplates.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            {byCategory.map(([category, list]) => (
              <optgroup key={category} label={`FL Studio — ${category}`}>
                {list.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {factory.length === 0 && userTemplates.length === 0 && (
            <div className="mt-1 text-xs text-engrave">
              {settings.flStudioPath
                ? L.noTemplates
                : L.setFlPath}
            </div>
          )}
        </div>

        <div>
          <div className={sectionLabel}>{L.location}</div>
          <select value={parentFolder} onChange={(e) => setParentFolder(e.target.value)} className={`${input} mt-1.5`}>
            {settings.watchedFolders.map((f) => (
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
            <div className="mt-1 truncate text-[11px] text-engrave">
              {parentFolder}
              {sep}
              {trimmed}
              {sep}
              {trimmed}.flp
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className={sectionLabel}>{L.stage}</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as SongStatus)} className={`${input} mt-1.5`}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={sectionLabel}>{L.release}</div>
            <select value={albumId} onChange={(e) => setAlbumId(e.target.value)} className={`${input} mt-1.5`}>
              <option value="">{L.none}</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} className="accent-orange-500" />
          {L.openAfter}
        </label>

        {demoMode && <div className="text-xs text-orange-200">{L.demo}</div>}
        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className={btn}>
            {L.cancel}
          </button>
          <button type="submit" disabled={!canCreate} className={btnPrimary}>
            {busy ? L.creating : L.create}
          </button>
        </div>
      </form>
    </Modal>
  );
}
