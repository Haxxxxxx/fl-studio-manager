import { CalendarDays, Disc3, KanbanSquare, LayoutDashboard, Library, Plus, Rocket, Settings as SettingsIcon, Shovel, Users } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { btnPrimary, engrave, Wordmark } from "../ui";
import { CrewSection } from "./CrewSection";
import { useCrewStore, useInCrew } from "../store/useCrewStore";
import { dict, tr } from "../i18n";

const T = dict(
  {
    dashboard: "Dashboard",
    library: "Library",
    pipeline: "Pipeline",
    releases: "Releases",
    calendar: "Calendar",
    people: "People",
    settings: "Settings",
    sampleData: "Sample data",
    tagline: "Session → release",
    newSong: "New song",
    peopleCredits: "People & credits",
    joinCrew: "Join your crew",
  },
  {
    dashboard: "Tableau de bord",
    library: "Bibliothèque",
    pipeline: "Pipeline",
    releases: "Sorties",
    calendar: "Calendrier",
    people: "Personnes",
    settings: "Réglages",
    sampleData: "Données d'exemple",
    tagline: "Session → sortie",
    newSong: "Nouveau son",
    peopleCredits: "Personnes et crédits",
    joinCrew: "Rejoindre ton crew",
  },
);

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
  const inCrew = useInCrew();
  const crewEnabled = useCrewStore((s) => s.enabled);
  const t = tr(T);

  const items = [
    { id: "dashboard" as const, label: t.dashboard, icon: LayoutDashboard },
    { id: "library" as const, label: t.library, icon: Library, badge: songCount },
    { id: "pipeline" as const, label: t.pipeline, icon: KanbanSquare },
    // Raw beats and finding similar ones: fuel for the Creation stage.
    { id: "digger" as const, label: "Digger", icon: Shovel },
    { id: "albums" as const, label: t.releases, icon: Disc3, badge: albums.length },
    { id: "calendar" as const, label: t.calendar, icon: CalendarDays },
    // Solo: People (credits, collaborators) moves down the list, see below.
    ...(inCrew ? [{ id: "people" as const, label: t.people, icon: Users, badge: peopleCount }] : []),
    { id: "launch" as const, label: "Launch Kit", icon: Rocket },
    { id: "settings" as const, label: t.settings, icon: SettingsIcon },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-rule bg-panel">
      <div className="flex flex-col gap-1.5 px-4 py-4">
        <Wordmark size={30} />
        <div className={`${engrave} text-[9.5px]`}>{demoMode ? t.sampleData : t.tagline}</div>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => openNewProject()}
          className={`${btnPrimary} w-full justify-center py-2`}
        >
          <Plus size={15} /> {t.newSong}
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
                active ? "bg-cream font-medium text-chassis" : "text-body hover:bg-raised hover:text-cream"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={16} strokeWidth={2} />
                {item.label}
              </span>
              {typeof item.badge === "number" && item.badge > 0 && (
                <span className={`font-mono text-[11px] tabular-nums ${active ? "text-chassis/70" : "text-engrave"}`}>{item.badge}</span>
              )}
            </button>
          );
        })}
        {!inCrew && (
          <button
            onClick={() => openPerson(null)}
            className={`mt-1 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
              view === "people" ? "bg-cream font-medium text-chassis" : "text-engrave hover:bg-raised hover:text-cream"
            }`}
          >
            <Users size={13} strokeWidth={2} /> {t.peopleCredits}
          </button>
        )}
      </nav>

      <CrewSection />
      {/* No crew yet (and a crew server in this build): the way in is in Settings. */}
      {crewEnabled && !inCrew && !demoMode && (
        <div className="mx-2 mt-3 border-t-2 border-rule-strong pt-3">
          <button
            onClick={() => setView("settings")}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-body transition-colors hover:bg-raised hover:text-cream"
          >
            <Users size={16} strokeWidth={2} /> {t.joinCrew}
          </button>
        </div>
      )}

      {albums.length > 0 && (
        <div className="mt-2 flex min-h-0 flex-col px-2">
          <div className={`px-3 pb-1.5 ${engrave}`}>{t.releases}</div>
          <div className="overflow-auto">
            {albums.map((a) => (
              <button
                key={a.id}
                onClick={() => openAlbum(a.id)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs ${
                  view === "albums" && openAlbumId === a.id ? "bg-rule text-cream" : "text-engrave hover:bg-raised hover:text-cream"
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: a.color }} />
                <span className="truncate">{a.title}</span>
                <span className="ml-auto text-engrave">{a.trackPaths.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

    </aside>
  );
}
