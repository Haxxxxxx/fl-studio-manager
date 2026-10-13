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
import { PackagePanel } from "./components/PackagePanel";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { NewProjectModal } from "./components/NewProjectModal";
import { flushWorkspace, useAppStore } from "./store/useAppStore";
import { useCrewStore } from "./store/useCrewStore";

const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;

/** After a scan: which songs kept their stage, notes, crew share… across a rename/move. */
function RelinkNotice() {
  const relinked = useAppStore((s) => s.relinked);
  const dismiss = useAppStore((s) => s.dismissRelinked);
  if (!relinked.length) return null;
  return (
    <div role="status" className="absolute bottom-3 right-3 z-40 max-w-sm rounded-md border border-rule bg-raised px-4 py-3 text-xs text-body shadow-xl">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium text-cream">
          Kept the details of {relinked.length} renamed or moved song{relinked.length === 1 ? "" : "s"}
        </span>
        <button onClick={dismiss} className="text-body hover:text-cream">
          OK
        </button>
      </div>
      <ul className="flex flex-col gap-0.5">
        {relinked.slice(0, 5).map((r) => (
          <li key={r.to} className="truncate" title={`${r.from} → ${r.to}`}>
            {fileName(r.from)} → <span className="text-cream">{r.reason === "moved" ? `moved (${fileName(r.to)})` : fileName(r.to)}</span>
          </li>
        ))}
        {relinked.length > 5 && <li className="text-engrave">+{relinked.length - 5} more</li>}
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
        Loading...
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-chassis text-cream">
      <Sidebar />
      {view === "dashboard" && <Dashboard />}
      {view === "library" && <LibraryView />}
      {view === "pipeline" && <PipelineView />}
      {view === "albums" && <AlbumsView />}
      {view === "people" && <PeopleView />}
      {view === "launch" && <LaunchKitView />}
      {view === "calendar" && <CalendarView />}
      {view === "settings" && <SettingsView />}
      {/* Keyed so per-song drawer state (messages, inputs) resets on switch. */}
      {view !== "settings" && view !== "launch" && <ProjectDrawer key={detailPath ?? ""} />}
      <NewProjectModal />
      <RenderPanel />
      <PackagePanel />
      {!isTauri() && (
        <div className="absolute bottom-3 left-1/2 z-40 max-w-xl -translate-x-1/2 rounded-md border border-amber-400/40 bg-[#2a2112] px-4 py-2 text-xs text-amber-100 shadow-xl">
          This is the app's UI in a browser tab, so nothing can load or save here (no folders, settings or AI key). Run{" "}
          <code className="rounded bg-black/30 px-1">npm run tauri dev</code> and use the FL Manager window that opens.
        </div>
      )}
      <RelinkNotice />
      {(startupError || saveError) && (
        <div role="alert" className="absolute left-1/2 top-3 z-40 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-md border border-red-500/40 bg-[#2a1215] px-4 py-2 text-xs text-red-200 shadow-xl">
          <span>{saveError ?? startupError}</span>
          <button onClick={dismissErrors} aria-label="Dismiss" className="shrink-0 text-red-200/70 hover:text-red-100">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
