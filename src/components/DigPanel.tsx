import { useDigger } from "../store/useDigger";
import { dict, tr } from "../i18n";

// The right side of the Digger: the picked beats, then (next PRs) the dig
// itself: what they have in common and similar beats to listen to.

const T = dict(
  {
    title: "Picked",
    none: "Pick the beats that have the vibe you want (up to 5).",
  },
  {
    title: "Choisies",
    none: "Choisis les prods qui ont le vibe que tu cherches (5 max).",
  },
);

export function DigPanel() {
  const t = tr(T);
  const picked = useDigger((s) => s.picked);
  const beats = useDigger((s) => s.beats);
  const byPath = new Map(beats.map((b) => [b.path, b]));
  return (
    <aside className="flex w-[380px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-rule p-4" aria-label={t.title}>
      <h2 className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave">{t.title}</h2>
      {picked.length === 0 ? (
        <p className="text-sm text-engrave">{t.none}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {picked.map((p, i) => (
            <li key={p} className="flex items-center gap-2 text-sm">
              <span className="w-4 font-mono text-[11px] text-engrave">{i + 1}</span>
              <span className="truncate text-cream">{byPath.get(p)?.name ?? p}</span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
