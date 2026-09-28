import { Disc3, KanbanSquare, LayoutDashboard, Library, Music2, Plus, Settings as SettingsIcon, Users } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export function Sidebar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const openAlbum = useAppStore((s) => s.openAlbum);
  const songCount = useAppStore((s) => s.projects.filter((p) => !p.isTemplate).length);
  const albums = useAppStore((s) => s.workspace.albums);
  const openAlbumId = useAppStore((s) => s.openAlbumId);
  const demoMode = useAppStore((s) => s.demoMode);
  const openNewProject = useAppStore((s) => s.openNewProject);
  const openPerson = useAppStore((s) => s.openPerson);
  const peopleCount = useAppStore((s) => s.workspace.people.length);

  const items = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "library" as const, label: "Library", icon: Library, badge: songCount },
    { id: "pipeline" as const, label: "Pipeline", icon: KanbanSquare },
    { id: "albums" as const, label: "Releases", icon: Disc3, badge: albums.length },
    { id: "people" as const, label: "People", icon: Users, badge: peopleCount },
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
          <div className="text-[11px] text-white/40">{demoMode ? "Sample data" : "Studio workspace"}</div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => openNewProject()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-orange-500 py-2 text-sm font-medium text-white hover:bg-orange-400"
        >
          <Plus size={15} /> New song
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() =>
                item.id === "albums" ? openAlbum(null) : item.id === "people" ? openPerson(null) : setView(item.id)
              }
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                active ? "bg-orange-500/15 text-orange-300" : "text-white/60 hover:bg-white/5 hover:text-white/90"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </span>
              {typeof item.badge === "number" && item.badge > 0 && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-white/60">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {albums.length > 0 && (
        <div className="mt-2 flex min-h-0 flex-col px-2">
          <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-white/30">Releases</div>
          <div className="overflow-auto">
            {albums.map((a) => (
              <button
                key={a.id}
                onClick={() => openAlbum(a.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs ${
                  view === "albums" && openAlbumId === a.id ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: a.color }} />
                <span className="truncate">{a.title}</span>
                <span className="ml-auto text-white/30">{a.trackPaths.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
