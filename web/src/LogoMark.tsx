// The Hivo mark and wordmark (same as src/ui/base.tsx; the web app only
// shares package-free modules with the desktop app).
/** Hexagon corners in a 100 × 86.6 box, scaled by `k` around the centre. */
function hex(k: number): string {
  const corners = [
    [25, 0],
    [75, 0],
    [100, 43.3],
    [75, 86.6],
    [25, 86.6],
    [0, 43.3],
  ];
  return corners.map(([x, y]) => `${50 + (x - 50) * k},${43.3 + (y - 43.3) * k}`).join(" L");
}

/** The Hivo mark: one hive cell with a lit LED (a song that's live).
 * `tone="light"` is for cream grounds: black outline, orange LED. At 32px
 * and below the outline gets heavier and the glow drops; at 16px it's a
 * solid cell with a dark centre so it still reads in a tab. `full` keeps
 * the large-size drawing at any size (the wordmark's cell). */
export function LogoMark({ size = 32, tone = "dark", full = false }: { size?: number; tone?: "dark" | "light"; full?: boolean }) {
  const ring = tone === "light" ? "#0d0d0c" : "#ff5a1f";
  if (size <= 16 && !full) {
    return (
      <svg aria-hidden width={size} height={size * 0.866} viewBox="0 0 100 86.6" className="shrink-0">
        <path d={`M${hex(1)}Z`} fill={ring} />
        <circle cx="50" cy="43.3" r="17" fill={tone === "light" ? "#f2efe8" : "#0d0d0c"} />
      </svg>
    );
  }
  const small = size <= 32 && !full;
  const led = small ? 12 : 8.5;
  return (
    <svg aria-hidden width={size} height={size * 0.866} viewBox="0 0 100 86.6" className="shrink-0 overflow-visible">
      <path d={`M${hex(1)}Z M${hex(small ? 0.68 : 0.8)}Z`} fill={ring} fillRule="evenodd" />
      <circle cx="50" cy="43.3" r={led} fill="#ff5a1f" style={small ? undefined : { filter: `drop-shadow(0 0 ${size * 0.08}px #ff5a1f)` }} />
    </svg>
  );
}

/** The wordmark: "Hiv" in Oswald with the hive cell standing in for the
 * "o". `size` is the cap height's font size in px. */
export function Wordmark({ size = 28, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  return (
    <span
      role="img"
      aria-label="Hivo"
      className="inline-flex shrink-0 items-end whitespace-nowrap font-semibold leading-none"
      style={{ fontFamily: '"Oswald", "Barlow Condensed", sans-serif', fontSize: size, letterSpacing: "-0.01em", color: tone === "light" ? "#0d0d0c" : "#f2efe8" }}
    >
      <span aria-hidden>Hiv</span>
      <span aria-hidden style={{ marginLeft: size * 0.04, marginBottom: size * 0.047 }}>
        <LogoMark size={size * 0.6} tone={tone} full />
      </span>
    </span>
  );
}

/** Wordmark sized for headers. */
export const LogoLockup = ({ size = 32 }: { size?: number }) => <Wordmark size={size * 0.9} />;
