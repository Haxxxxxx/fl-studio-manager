import { useEffect, useState } from "react";
import { Check, FolderPlus, RefreshCw } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { btn } from "../ui";

/** Every DAW's default projects folder found on this computer, each linked
 * only when the user says so (first-run screen and Settings). */
export function DetectedFolders({ compact = false }: { compact?: boolean }) {
  const detected = useAppStore((s) => s.detectedFolders);
  const detectFolders = useAppStore((s) => s.detectFolders);
  const linkDetected = useAppStore((s) => s.linkDetected);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detected === null) void detectFolders();
  }, [detected, detectFolders]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (detected === null) return <div className="text-xs text-engrave">Looking for DAW folders…</div>;

  return (
    <div className={`flex flex-col gap-2 ${compact ? "text-left" : ""}`}>
      {detected.length === 0 ? (
        <div className="text-xs text-engrave">No DAW's default projects folder was found on this computer. Add your folders by hand.</div>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label="DAW folders found on this computer">
          {detected.map((f) => (
            <li key={f.path} className="flex items-center gap-3 rounded-md border border-rule bg-raised px-3 py-2 text-sm">
              <span className="w-28 shrink-0 font-medium text-cream">{f.daw}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-body" title={f.path}>
                  {f.path}
                </span>
                <span className="text-[11px] text-engrave">
                  {f.projects === 0 ? "No projects in it yet" : `${f.projects >= 999 ? "999+" : f.projects} project${f.projects === 1 ? "" : "s"}`}
                </span>
              </span>
              {f.linked ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-300">
                  <Check size={13} /> Linked
                </span>
              ) : (
                <button onClick={() => void run(f.path, () => linkDetected(f.path))} disabled={busy !== null} className={`${btn} shrink-0 text-xs`}>
                  <FolderPlus size={13} /> {busy === f.path ? "Linking…" : "Link"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button onClick={() => void run("again", detectFolders)} disabled={busy !== null} className="flex items-center gap-1 text-xs text-engrave hover:text-cream">
          <RefreshCw size={12} className={busy === "again" ? "animate-spin" : ""} /> Look again
        </button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </div>
  );
}
