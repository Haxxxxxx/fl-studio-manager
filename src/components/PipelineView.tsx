import { useAppStore } from "../store/useAppStore";
import { EmptyLibrary } from "./LibraryView";
import { PipelinePage } from "./pipeline/PipelinePage";
import { useMineSource } from "./pipeline/mine";

// Your pipeline in three views over one model (src/lib/pipeline.ts): board,
// list and table. Columns are yours to rename, add, remove and reorder; each
// sits on a lifecycle stage, which is all the crew sees. The crew board is
// the same page over the crew's songs (crew section of the menu).

export function PipelineView() {
  const settings = useAppStore((s) => s.settings);
  const demoMode = useAppStore((s) => s.demoMode);
  const source = useMineSource();
  if (settings.watchedFolders.length === 0 && !demoMode) return <EmptyLibrary />;
  return <PipelinePage title="Pipeline" source={source} />;
}
