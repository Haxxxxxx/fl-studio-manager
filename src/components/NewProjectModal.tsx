import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import * as api from "../lib/tauri";
import { STATUSES } from "../lib/songs";
import type { SongStatus, TemplateInfo } from "../types";
import { Modal, btn, btnPrimary, input, sectionLabel } from "./ui";

export function NewProjectModal() {
  const draft = useAppStore((s) => s.newProject);
  const close = useAppStore((s) => s.closeNewProject);
  const settings = useAppStore((s) => s.settings);
  const projects = useAppStore((s) => s.projects);
  const albums = useAppStore((s) => s.workspace.albums);
  const demoMode = useAppStore((s) => s.demoMode);
  const createProject = useAppStore((s) => s.createProject);
  const openDetail = useAppStore((s) => s.openDetail);

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

  useEffect(() => {
    if (!draft) return;
    setStatus(draft.status);
    setAlbumId(draft.albumId ?? "");
    let cancelled = false;
    Promise.all([api.listTemplates(settings.flStudioPath), api.defaultTemplate(settings.flStudioPath)])
      .then(([list, fallback]) => {
        if (cancelled) return;
        setFactory(list);
        setTemplatePath((current) => current || fallback || userTemplates[0]?.path || list[0]?.path || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [draft, settings.flStudioPath, userTemplates]);

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
      close();
      setName("");
      openDetail(path);
      if (openAfter) await api.openInFlStudio(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const sep = parentFolder.includes("\\") ? "\\" : "/";

  return (
    <Modal title="New song" onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <div className={sectionLabel}>Name</div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Song title" className={`${input} mt-1.5`} />
          {clash && <div className="mt-1 text-xs text-amber-400">A song with this name already exists there.</div>}
        </div>

        <div>
          <div className={sectionLabel}>Start from</div>
          <select value={templatePath} onChange={(e) => setTemplatePath(e.target.value)} className={`${input} mt-1.5`}>
            {!templatePath && <option value="">Choose a template…</option>}
            {userTemplates.length > 0 && (
              <optgroup label="Your templates">
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
            <div className="mt-1 text-xs text-white/40">
              {settings.flStudioPath
                ? "No templates found. Save any project into a Templates folder inside a linked folder to start new songs from it."
                : "Set the FL Studio path in Settings to see its templates."}
            </div>
          )}
        </div>

        <div>
          <div className={sectionLabel}>Location</div>
          <select value={parentFolder} onChange={(e) => setParentFolder(e.target.value)} className={`${input} mt-1.5`}>
            {settings.watchedFolders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {trimmed && parentFolder && (
            <div className="mt-1 truncate text-[11px] text-white/35">
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
            <div className={sectionLabel}>Stage</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as SongStatus)} className={`${input} mt-1.5`}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className={sectionLabel}>Release</div>
            <select value={albumId} onChange={(e) => setAlbumId(e.target.value)} className={`${input} mt-1.5`}>
              <option value="">None</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={openAfter} onChange={(e) => setOpenAfter(e.target.checked)} className="accent-orange-500" />
          Open in FL Studio after creating
        </label>

        {demoMode && <div className="text-xs text-orange-200">Link a real project folder to create songs.</div>}
        {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className={btn}>
            Cancel
          </button>
          <button type="submit" disabled={!canCreate} className={btnPrimary}>
            {busy ? "Creating…" : "Create song"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
