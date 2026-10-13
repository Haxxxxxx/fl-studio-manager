// The FL Manager mark (same as LogoMark in src/ui/base.tsx; the web app only
// shares package-free modules with the desktop app): a lit rack key, orange
// with an "FL" stencil and one LED. Below 24px the LED drops.
export function LogoMark({ size = 32 }: { size?: number }) {
  const small = size < 24;
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 bg-hot font-display font-bold leading-[0.82] text-chassis"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(2, size * 0.0625),
        alignItems: small ? "center" : "flex-end",
        justifyContent: small ? "center" : "flex-start",
        padding: small ? 0 : `0 0 ${size * 0.066}px ${size * 0.1}px`,
        fontSize: small ? size * 0.75 : size * 0.78,
        letterSpacing: "-0.02em",
      }}
    >
      {!small && <span className="absolute rounded-full bg-chassis" style={{ top: size * 0.11, right: size * 0.11, width: size * 0.11, height: size * 0.11 }} />}
      FL
    </span>
  );
}

/** Mark + "MANAGER" wordmark. */
export function LogoLockup({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="font-display font-bold uppercase leading-none text-cream" style={{ fontSize: size * 0.68 }}>
        Manager
      </span>
    </span>
  );
}
