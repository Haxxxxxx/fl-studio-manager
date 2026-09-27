import { LayoutDashboard, Library, Settings as SettingsIcon, Music2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const projectCount = useAppStore((s) => s.projects.length);
  const demoMode = useAppStore((s) => s.demoMode);

  const items = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "library" as const, label: "Library", icon: Library, badge: projectCount },
    { id: "settings" as const, label: "Settings", icon: SettingsIcon },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#131318]">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400">
          <Music2 size={18} strokeWidth={2.25} />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">FL Manager</div>
          <div className="text-[11px] text-white/40">
            {demoMode ? "Sample data" : "Project workspace"}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-2 py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-orange-500/15 text-orange-300"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </span>
              {typeof item.badge === "number" && item.badge > 0 && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-4 py-3 text-[11px] leading-relaxed text-white/30">
        Export uses FL Studio's own command-line renderer. Run a test render
        after setting your FL Studio path.
      </div>
    </aside>
  );
}
