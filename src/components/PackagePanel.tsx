import { useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, ShieldAlert, X, XCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../lib/format";
import { revealInFileManager } from "../lib/tauri";
import { stripProjectExt } from "../lib/daws";

/** Every file a package would hold, before anything is written: the user
 * sees (and can untick) exactly what leaves in the zip. */
export function PackageConfirm() {
  const plan = useAppStore((s) => s.packagePlan);
  const confirm = useAppStore((s) => s.confirmPackage);
  const cancel = useAppStore((s) => s.cancelPackage);
  const [off, setOff] = useState<Set<string>>(new Set());
  if (!plan) return null;

  const name = (p: string) => stripProjectExt(p.split(/[/\\]/).pop() ?? p);
  const toggle = (path: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const approved = plan.plans.map((p) => p.files.filter((f) => !off.has(f.path)).map((f) => f.path));
  const count = approved.reduce((n, a) => n + a.length, 0);
  const songs = plan.plans.filter((p) => !p.error).length;
  const close = () => {
    setOff(new Set());
    cancel();
  };

  return (
    <div className="absolute bottom-4 left-60 z-30 flex max-h-[70vh] w-[28rem] flex-col rounded-lg border border-rule bg-raised shadow-2xl">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <div className="text-sm font-medium text-cream">Check what goes in the package{songs === 1 ? "" : "s"}</div>
        <button onClick={close} aria-label="Cancel" className="rounded p-1 text-engrave hover:bg-rule hover:text-cream">
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-2 text-xs">
        {plan.plans.map((p) => (
          <div key={p.projectPath} className="py-2">
            <div className="font-medium text-cream">{name(p.projectPath)}</div>
            {p.error ? (
              <div className="mt-1 text-red-300/80">{p.error}</div>
            ) : (
              <>
                <div className="mt-1 text-engrave">The project file, plus:</div>
                {p.files.length === 0 && <div className="text-engrave">no samples found</div>}
                {p.files.map((f) => (
                  <label key={f.path} className="flex cursor-pointer items-center gap-2 py-0.5" title={f.path}>
                    <input type="checkbox" checked={!off.has(f.path)} onChange={() => toggle(f.path)} className="accent-orange-500" />
                    <span className="min-w-0 flex-1 truncate text-body">{f.name}</span>
                    <span className="shrink-0 text-engrave">{formatBytes(f.bytes)}</span>
                  </label>
                ))}
                {p.refused.length > 0 && (
                  <details className="mt-1 text-amber-300/80">
                    <summary className="flex cursor-pointer items-center gap-1">
                      <ShieldAlert size={12} /> {p.refused.length} path{p.refused.length === 1 ? "" : "s"} the project names will never be packaged
                    </summary>
                    {p.refused.map((r) => (
                      <div key={r.path} className="ml-4 truncate" title={r.path}>
                        {r.path} — {r.reason}
                      </div>
                    ))}
                  </details>
                )}
                {p.missing.length > 0 && (
                  <PathList className="mt-1 text-engrave" paths={p.missing}>
                    {p.missing.length} sample{p.missing.length === 1 ? "" : "s"} not found
                  </PathList>
                )}
              </>
            )}
          </div>
        ))}
        {plan.skipped.map((r) => (
          <div key={r.projectPath} className="py-2">
            <div className="font-medium text-cream">{name(r.projectPath)}</div>
            <div className="mt-1 text-engrave">{r.error}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-rule px-4 py-3">
        <button onClick={close} className="rounded-md border border-rule-strong px-3 py-1.5 text-xs text-body hover:bg-rule">
          Cancel
        </button>
        <button
          onClick={() => {
            setOff(new Set());
            void confirm(approved);
          }}
          disabled={songs === 0}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-chassis hover:bg-orange-400 disabled:opacity-40"
        >
          Write {songs === 1 ? "package" : `${songs} packages`} ({count} sample{count === 1 ? "" : "s"})
        </button>
      </div>
    </div>
  );
}

export function PackagePanel() {
  const results = useAppStore((s) => s.packageResults);
  const packaging = useAppStore((s) => s.packaging);
  const dismiss = useAppStore((s) => s.dismissPackageResults);
  if (results === null) return null;

  const name = (p: string) => stripProjectExt(p.split(/[/\\]/).pop() ?? p);
  const firstZip = results.find((r) => r.zipPath)?.zipPath;

  return (
    <div className="absolute bottom-4 left-60 z-30 w-96 rounded-lg border border-rule bg-raised shadow-2xl">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-cream">
          {packaging && <Loader2 size={14} className="animate-spin text-orange-400" />}
          {packaging ? `Packaging… ${results.length} done` : "Packages ready"}
        </div>
        <div className="flex items-center gap-1">
          {firstZip && (
            <button
              onClick={() => revealInFileManager(firstZip)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-body hover:bg-rule hover:text-cream"
            >
              <FolderOpen size={13} /> Show
            </button>
          )}
          {!packaging && (
            <button onClick={dismiss} className="rounded p-1 text-engrave hover:bg-rule hover:text-cream">
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
              <span className="min-w-0 flex-1 truncate text-cream">{name(r.projectPath)}</span>
              {!r.error && (
                <span className="text-engrave">
                  {r.included} samples · {formatBytes(r.bytes)}
                </span>
              )}
            </div>
            {r.error && <div className="ml-5 text-[11px] text-red-300/80">{r.error}</div>}
            {(r.refused?.length ?? 0) > 0 && (
              <PathList className="ml-5 text-[11px] text-amber-300/80" paths={r.refused!}>
                {r.refused!.length} path{r.refused!.length === 1 ? "" : "s"} refused (not audio, hidden or network)
              </PathList>
            )}
            {r.missing.length > 0 && (
              <PathList className="ml-5 text-[11px] text-amber-300/80" paths={r.missing}>
                {r.missing.length} sample{r.missing.length === 1 ? "" : "s"} couldn't be found and aren't included
              </PathList>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-rule px-4 py-2 text-[11px] text-engrave">
        Open a package directly from FL (File → Open) — samples relink automatically.
      </div>
    </div>
  );
}

/** A count that opens into the actual paths (what FL has stored), so you can
 * see which samples to find. */
function PathList({ paths, className, children }: { paths: string[]; className: string; children: React.ReactNode }) {
  return (
    <details className={className}>
      <summary className="cursor-pointer select-none hover:text-cream">{children}</summary>
      <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto pl-3 font-mono text-[10.5px]">
        {paths.map((path) => (
          <li key={path} className="break-all select-text">
            {path}
          </li>
        ))}
      </ul>
    </details>
  );
}
