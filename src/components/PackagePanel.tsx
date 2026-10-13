import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, X, XCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../lib/format";
import { revealInFileManager } from "../lib/tauri";
import { stripProjectExt } from "../lib/daws";

export function PackagePanel() {
  const results = useAppStore((s) => s.packageResults);
  const packaging = useAppStore((s) => s.packaging);
  const dismiss = useAppStore((s) => s.dismissPackageResults);
  if (results === null) return null;

  const name = (p: string) => stripProjectExt(p.split(/[/\\]/).pop() ?? p);
  const firstZip = results.find((r) => r.zipPath)?.zipPath;

  return (
    <div className="absolute bottom-4 left-60 z-30 w-96 rounded-lg border border-white/10 bg-[#18181d] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          {packaging && <Loader2 size={14} className="animate-spin text-orange-400" />}
          {packaging ? `Packaging… ${results.length} done` : "Packages ready"}
        </div>
        <div className="flex items-center gap-1">
          {firstZip && (
            <button
              onClick={() => revealInFileManager(firstZip)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              <FolderOpen size={13} /> Show
            </button>
          )}
          {!packaging && (
            <button onClick={dismiss} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="max-h-64 overflow-auto px-2 py-2">
        {results.map((r) => (
          <div key={r.projectPath} className="px-2 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              {r.error ? (
                <XCircle size={13} className="shrink-0 text-red-400" />
              ) : r.missing.length ? (
                <AlertTriangle size={13} className="shrink-0 text-amber-400" />
              ) : (
                <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
              )}
              <span className="min-w-0 flex-1 truncate text-white/80">{name(r.projectPath)}</span>
              {!r.error && (
                <span className="text-white/40">
                  {r.included} samples · {formatBytes(r.bytes)}
                </span>
              )}
            </div>
            {r.error && <div className="ml-5 text-[11px] text-red-300/80">{r.error}</div>}
            {r.missing.length > 0 && (
              <div className="ml-5 text-[11px] text-amber-300/80" title={r.missing.join("\n")}>
                {r.missing.length} sample{r.missing.length === 1 ? "" : "s"} couldn't be found and aren't included
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-2 text-[11px] text-white/35">
        Open a package directly from FL (File → Open) — samples relink automatically.
      </div>
    </div>
  );
}
