import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { LibraryView } from "./components/LibraryView";
import { SettingsView } from "./components/SettingsView";
import { RenderPanel } from "./components/RenderPanel";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const init = useAppStore((s) => s.init);
  const view = useAppStore((s) => s.view);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);

  useEffect(() => {
    init();
  }, [init]);

  if (!settingsLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f0f12] text-white/40 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="relative flex h-screen bg-[#0f0f12] text-white">
      <Sidebar />
      {view === "dashboard" && <Dashboard />}
      {view === "library" && <LibraryView />}
      {view === "settings" && <SettingsView />}
      <RenderPanel />
    </div>
  );
}
