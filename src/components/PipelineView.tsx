import { Columns3, List, Search, Table2 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { usePipelineView, type PipelineViewKind } from "../store/usePipelineView";
import { EmptyLibrary } from "./LibraryView";
import { CrewBoard } from "./CrewBoard";
import { useCanShare } from "./CrewPanel";
import { useCrewStore } from "../store/useCrewStore";
import { PipelineBoard } from "./pipeline/PipelineBoard";
import { PipelineList } from "./pipeline/PipelineList";
import { PipelineTable } from "./pipeline/PipelineTable";

// Your pipeline in three views over one model (src/lib/pipeline.ts): board,
// list and table. Columns are yours to rename, add, remove and reorder; each
// sits on a lifecycle stage, which is all the crew sees. The crew board keeps
// the five stages.

const VIEWS: { id: PipelineViewKind; label: string; icon: typeof List }[] = [
  { id: "board", label: "Board", icon: Columns3 },
  { id: "list", label: "List", icon: List },
  { id: "table", label: "Table", icon: Table2 },
];

export function PipelineView() {
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const board = useAppStore((s) => s.pipelineBoard);
  const setBoard = useAppStore((s) => s.setPipelineBoard);
  const view = usePipelineView((s) => s.view);
  const setView = usePipelineView((s) => s.setView);
  const query = usePipelineView((s) => s.query);
  const setQuery = usePipelineView((s) => s.setQuery);
  const { can: canShare, crewName } = useCanShare();
  const crewSongCount = useCrewStore((s) => s.songs.length);
  // No local projects: the crew board is the only board.
  const shownBoard = canShare && (board === "crew" || settings.watchedFolders.length === 0) ? "crew" : "mine";

  // Crew members without FL projects (a manager, a promoter) still get the crew board.
  if (settings.watchedFolders.length === 0 && !demoMode && !canShare) {
    return <EmptyLibrary />;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-6 py-3">
        <div className="mr-auto">
          <h1 className="font-display text-3xl uppercase leading-none tracking-tight text-cream">Pipeline</h1>
          {shownBoard === "crew" && <p className="mt-1 text-xs text-engrave">{crewName} · anyone in the crew can move a card</p>}
        </div>
        {shownBoard === "mine" && (
          <>
            <label className="flex items-center gap-1.5 rounded-md border border-rule bg-chassis px-2 py-1 text-xs focus-within:border-hot">
              <Search size={12} className="text-engrave" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="Filter songs, #tags, key"
                aria-label="Filter songs"
                className="w-44 bg-transparent text-cream placeholder:text-engrave focus:outline-none"
              />
            </label>
            <div className="flex rounded-md border border-rule p-0.5 text-xs" role="tablist" aria-label="View">
              {VIEWS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 ${view === id ? "bg-rule-strong text-cream" : "text-engrave hover:text-cream"}`}
                >
                  <Icon size={12} aria-hidden /> {label}
                </button>
              ))}
            </div>
          </>
        )}
        {canShare && (
          <div className="flex rounded-md border border-rule p-0.5 text-xs" role="tablist" aria-label="Board">
            {(["mine", "crew"] as const).map((b) => (
              <button
                key={b}
                role="tab"
                aria-selected={shownBoard === b}
                onClick={() => setBoard(b)}
                className={`rounded px-3 py-1 ${shownBoard === b ? "bg-rule-strong text-cream" : "text-engrave hover:text-cream"}`}
              >
                {b === "mine" ? "My songs" : `Crew · ${crewSongCount}`}
              </button>
            ))}
          </div>
        )}
      </div>
      {shownBoard === "crew" ? (
        <CrewBoard />
      ) : view === "list" ? (
        <PipelineList />
      ) : view === "table" ? (
        <PipelineTable />
      ) : (
        <PipelineBoard />
      )}
    </div>
  );
}
