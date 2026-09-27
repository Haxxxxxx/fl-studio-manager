import { CheckCircle2, Loader2, XCircle, Clock, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export function RenderPanel() {
  const renderJobs = useAppStore((s) => s.renderJobs);
  const rendering = useAppStore((s) => s.rendering);
  const dismiss = useAppStore((s) => s.dismissRenderPanel);

  if (renderJobs.size === 0) return null;

  const entries = Array.from(renderJobs.entries());
  const done = entries.filter(([, j]) => j.status === "done").length;
  const errored = entries.filter(([, j]) => j.status === "error").length;

  return (
    <div className="absolute bottom-4 right-4 w-80 rounded-lg border border-white/10 bg-[#18181d] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="text-sm font-medium text-white/90">
          {rendering ? "Exporting projects..." : "Export complete"}
        </div>
        {!rendering && (
          <button
            onClick={dismiss}
            className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-auto px-2 py-2">
        {entries.map(([path, job]) => (
          <div key={path} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            {job.status === "queued" && <Clock size={13} className="shrink-0 text-white/30" />}
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
              <div className="truncate text-white/70">{path.split(/[/\\]/).pop()}</div>
              {job.status === "error" && job.message && (
                <div className="truncate text-[11px] text-red-300/80">{job.message}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {!rendering && (
        <div className="border-t border-white/10 px-4 py-2 text-[11px] text-white/40">
          {done} done{errored > 0 ? `, ${errored} failed` : ""}
        </div>
      )}
    </div>
  );
}
