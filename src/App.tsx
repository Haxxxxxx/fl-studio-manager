import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { LibraryView } from "./components/LibraryView";
import { PipelineView } from "./components/PipelineView";
import { AlbumsView } from "./components/AlbumsView";
import { PeopleView } from "./components/PeopleView";
import { SettingsView } from "./components/SettingsView";
import { LaunchKitView } from "./components/LaunchKitView";
import { RenderPanel } from "./components/RenderPanel";
import { PackagePanel } from "./components/PackagePanel";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { NewProjectModal } from "./components/NewProjectModal";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);
  const detailPath = useAppStore((s) => s.detailPath);
  const startupError = useAppStore((s) => s.startupError);

  useEffect(() => {
    init();
  }, [init]);

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
      <div className="flex h-screen items-center justify-center bg-[#0f0f12] text-sm text-white/40">
        Loading...
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-[#0f0f12] text-white">
      <Sidebar />
      {view === "dashboard" && <Dashboard />}
      {view === "library" && <LibraryView />}
      {view === "pipeline" && <PipelineView />}
      {view === "albums" && <AlbumsView />}
      {view === "people" && <PeopleView />}
      {view === "launch" && <LaunchKitView />}
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
      {startupError && (
        <div className="absolute left-1/2 top-3 z-40 max-w-xl -translate-x-1/2 rounded-md border border-red-500/40 bg-[#2a1215] px-4 py-2 text-xs text-red-200 shadow-xl">
          {startupError}
        </div>
      )}
    </div>
  );
}
