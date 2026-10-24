import { DiggerView } from "./components/DiggerView";
import { applyLang, dict, resolveLang, tr } from "./i18n";
import { CrewBoardView, CrewMembersView, CrewReleasesView, CrewSettingsView } from "./components/CrewViews";
import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { LibraryView } from "./components/LibraryView";
import { PipelineView } from "./components/PipelineView";
import { AlbumsView } from "./components/AlbumsView";
import { PeopleView } from "./components/PeopleView";
import { SettingsView } from "./components/SettingsView";
import { LaunchKitView } from "./components/LaunchKitView";
import { CalendarView } from "./components/CalendarView";
import { RenderPanel } from "./components/RenderPanel";
import { PackageConfirm, PackagePanel } from "./components/PackagePanel";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { NewProjectModal } from "./components/NewProjectModal";
import { flushWorkspace, useAppStore } from "./store/useAppStore";
import { useCrewStore } from "./store/useCrewStore";
import { StatusDot, btnPrimary, btnQuiet } from "./ui";

const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;

const T = dict(
  {
    kept: (n: number) => `Kept the details of ${n} renamed or moved song${n === 1 ? "" : "s"}`,
    ok: "OK",
    moved: (file: string) => `moved (${file})`,
    more: (n: number) => `+${n} more`,
    loading: "Loading...",
    browserBefore: "This is the app's UI in a browser tab, so nothing can load or save here (no folders, settings or AI key). Run",
    browserAfter: "and use the Hivo window that opens.",
    dismiss: "Dismiss",
    updateReady: (v: string) => `Hivo ${v} is ready`,
    updateDownloading: (v: string, pct: number | null) => `Downloading Hivo ${v}${pct === null ? "…" : ` · ${pct}%`}`,
    updateRestarting: (v: string) => `Hivo ${v} is installed, restarting…`,
    updateFailed: (v: string, error: string) => `Couldn't update to Hivo ${v}: ${error}`,
    updateNow: "Update and restart",
    retry: "Retry",
    later: "Later",
  },
  {
    kept: (n: number) =>
      n === 1 ? "Infos gardées pour 1 son renommé ou déplacé" : `Infos gardées pour ${n} sons renommés ou déplacés`,
    ok: "OK",
    moved: (file: string) => `déplacé (${file})`,
    more: (n: number) => `+${n} autres`,
    loading: "Chargement...",
    browserBefore:
      "C'est l'interface de l'app dans un onglet de navigateur, donc rien ne peut se charger ni s'enregistrer ici (pas de dossiers, de réglages ni de clé IA). Lance",
    browserAfter: "et utilise la fenêtre Hivo qui s'ouvre.",
    dismiss: "Fermer",
    updateReady: (v: string) => `Hivo ${v} est prêt`,
    updateDownloading: (v: string, pct: number | null) => `Téléchargement de Hivo ${v}${pct === null ? "…" : ` · ${pct} %`}`,
    updateRestarting: (v: string) => `Hivo ${v} est installé, redémarrage…`,
    updateFailed: (v: string, error: string) => `Impossible de passer à Hivo ${v} : ${error}`,
    updateNow: "Mettre à jour et redémarrer",
    retry: "Réessayer",
    later: "Plus tard",
  },
);

/** A newer Hivo is ready: one strip above the view, one orange action. Only
 * shown once a version is known (check failures stay in Settings). */
function UpdateNotice() {
  const update = useAppStore((s) => s.update);
  const install = useAppStore((s) => s.installUpdate);
  const dismiss = useAppStore((s) => s.dismissUpdate);
  const { status, version } = update;
  if (!version || status === "idle" || status === "checking") return null;
  const pct = update.progress === undefined ? null : Math.round(update.progress * 100);
  const led = status === "error" ? "var(--color-missing)" : status === "available" ? "var(--color-hot)" : "var(--color-ok)";
  const text =
    status === "available"
      ? tr(T).updateReady(version)
      : status === "downloading"
        ? tr(T).updateDownloading(version, pct)
        : status === "ready"
          ? tr(T).updateRestarting(version)
          : tr(T).updateFailed(version, update.error ?? "");
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 border-b border-rule bg-panel px-5 py-2 text-xs">
      <StatusDot color={led} size={7} />
      <span className={`min-w-0 flex-1 truncate ${status === "error" ? "text-missing" : "text-cream"}`} title={text}>
        {text}
      </span>
      {status === "downloading" && pct !== null && (
        <span className="h-1 w-32 shrink-0 overflow-hidden rounded bg-rule" aria-hidden>
          <span className="block h-full bg-cream" style={{ width: `${pct}%` }} />
        </span>
      )}
      {status === "available" && (
        <button onClick={() => void install()} className={btnPrimary}>
          {tr(T).updateNow}
        </button>
      )}
      {status === "error" && (
        <button onClick={() => void install()} className={btnPrimary}>
          {tr(T).retry}
        </button>
      )}
      {(status === "available" || status === "error") && (
        <button onClick={dismiss} className={btnQuiet}>
          {tr(T).later}
        </button>
      )}
    </div>
  );
}

/** After a scan: which songs kept their stage, notes, crew share… across a rename/move. */
function RelinkNotice() {
  const relinked = useAppStore((s) => s.relinked);
  const dismiss = useAppStore((s) => s.dismissRelinked);
  if (!relinked.length) return null;
  return (
    <div role="status" className="absolute bottom-3 right-3 z-40 max-w-sm rounded-md border border-rule bg-raised px-4 py-3 text-xs text-body shadow-xl">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium text-cream">
          {tr(T).kept(relinked.length)}
        </span>
        <button onClick={dismiss} className="text-body hover:text-cream">
          {tr(T).ok}
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {relinked.slice(0, 5).map((r) => (
          <li key={r.to} className="truncate" title={`${r.from} → ${r.to}`}>
            {fileName(r.from)} → <span className="text-cream">{r.reason === "moved" ? tr(T).moved(fileName(r.to)) : fileName(r.to)}</span>
          </li>
        ))}
        {relinked.length > 5 && <li className="text-engrave">{tr(T).more(relinked.length - 5)}</li>}
      </ul>
    </div>
  );
}

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);
  const detailPath = useAppStore((s) => s.detailPath);
  const startupError = useAppStore((s) => s.startupError);
  const saveError = useAppStore((s) => s.saveError);
  const dismissErrors = useAppStore((s) => s.dismissErrors);
  // The app's language. Set before rendering; the root is keyed on it, so a
  // change remounts every screen in the new language (src/i18n).
  const lang = resolveLang(useAppStore((s) => s.settings.uiLanguage));
  applyLang(lang);

  useEffect(() => {
    init();
    void useCrewStore.getState().init();
  }, [init]);

  // Closing the window right after an edit: write the pending save first.
  useEffect(() => {
    if (!isTauri()) return;
    const off = getCurrentWindow().onCloseRequested(() => flushWorkspace());
    return () => void off.then((unlisten) => unlisten());
  }, []);

  // Coming back from FL Studio: pick up new saves, backups and mixdowns.
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      const { scanning, rendering, demoMode, rescan } = useAppStore.getState();
      if (scanning || rendering || demoMode || Date.now() - last < 15_000) return;
      last = Date.now();
      rescan().catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!settingsLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-chassis text-sm text-engrave">
        {tr(T).loading}
      </div>
    );
  }

  return (
    <div key={lang} className="relative flex h-screen bg-chassis text-cream">
      <Sidebar />
      {/* A column, so the update strip sits above the view (every view is
          flex-1 with its own overflow, so it still scrolls). */}
      <div className="flex min-w-0 flex-1 flex-col">
        <UpdateNotice />
        {view === "dashboard" && <Dashboard />}
        {view === "library" && <LibraryView />}
        {view === "pipeline" && <PipelineView />}
        {view === "albums" && <AlbumsView />}
        {view === "people" && <PeopleView />}
        {view === "launch" && <LaunchKitView />}
        {view === "calendar" && <CalendarView />}
        {view === "settings" && <SettingsView />}
        {view === "digger" && <DiggerView />}
        {view === "crewBoard" && <CrewBoardView />}
        {view === "crewReleases" && <CrewReleasesView />}
        {view === "crewMembers" && <CrewMembersView />}
        {view === "crewSettings" && <CrewSettingsView />}
      </div>
      {/* Keyed so per-song drawer state (messages, inputs) resets on switch. */}
      {view !== "settings" && view !== "launch" && <ProjectDrawer key={detailPath ?? ""} />}
      <NewProjectModal />
      <RenderPanel />
      <PackagePanel />
      <PackageConfirm />
      {!isTauri() && (
        <div className="absolute bottom-3 left-1/2 z-40 max-w-xl -translate-x-1/2 rounded-md border border-amber-400/40 bg-[#2a2112] px-4 py-2 text-xs text-amber-100 shadow-xl">
          {tr(T).browserBefore}{" "}
          <code className="rounded bg-black/30 px-1">npm run tauri dev</code> {tr(T).browserAfter}
        </div>
      )}
      <RelinkNotice />
      {(startupError || saveError) && (
        <div role="alert" className="absolute left-1/2 top-3 z-40 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-md border border-red-500/40 bg-[#2a1215] px-4 py-2 text-xs text-red-200 shadow-xl">
          <span>{saveError ?? startupError}</span>
          <button onClick={dismissErrors} aria-label={tr(T).dismiss} className="shrink-0 text-red-200/70 hover:text-red-100">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
