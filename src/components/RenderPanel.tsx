import { CheckCircle2, Loader2, XCircle, Clock, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { dict, tr } from "../i18n";

const T = dict(
  {
    exporting: "Exporting projects...",
    complete: "Export complete",
    finishedErrors: (n: number) => `Finished with ${n} error${n === 1 ? "" : "s"}`,
    summary: (done: number, failed: number) => `${done} done${failed > 0 ? `, ${failed} failed` : ""}`,
  },
  {
    exporting: "Export des projets...",
    complete: "Export terminé",
    finishedErrors: (n: number) => `Terminé avec ${n} erreur${n === 1 ? "" : "s"}`,
    summary: (done: number, failed: number) =>
      `${done} terminé${done > 1 ? "s" : ""}${failed > 0 ? `, ${failed} en échec` : ""}`,
  },
);

export function RenderPanel() {
  const renderJobs = useAppStore((s) => s.renderJobs);
  const rendering = useAppStore((s) => s.rendering);
  const dismiss = useAppStore((s) => s.dismissRenderPanel);

  if (renderJobs.size === 0) return null;

  const entries = Array.from(renderJobs.entries());
  const done = entries.filter(([, j]) => j.status === "done").length;
  const errored = entries.filter(([, j]) => j.status === "error").length;

  return (
    <div className="absolute bottom-4 right-4 w-80 rounded-lg border border-rule bg-raised shadow-2xl">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <div className="text-sm font-medium text-cream">
          {rendering ? tr(T).exporting : errored > 0 ? tr(T).finishedErrors(errored) : tr(T).complete}
        </div>
        {!rendering && (
          <button
            onClick={dismiss}
            className="rounded p-1 text-engrave hover:bg-rule hover:text-cream"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-auto px-2 py-2">
        {entries.map(([path, job]) => (
          <div key={path} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            {job.status === "queued" && <Clock size={13} className="shrink-0 text-engrave" />}
            {job.status === "rendering" && (
              <Loader2 size={13} className="shrink-0 animate-spin text-orange-400" />
            )}
            {job.status === "done" && (
              <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
            )}
            {job.status === "error" && (
              <XCircle size={13} className="shrink-0 text-red-400" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-body">{path.split(/[/\\]/).pop()}</div>
              {job.status === "error" && job.message && (
                <div className="truncate text-[11px] text-red-300/80">{job.message}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {!rendering && (
        <div className="border-t border-rule px-4 py-2 text-[11px] text-engrave">
          {tr(T).summary(done, errored)}
        </div>
      )}
    </div>
  );
}
