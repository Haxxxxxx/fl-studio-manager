/** What the OS calls the place deleted files go. */
export const TRASH_NAME = navigator.userAgent.includes("Mac") ? "Trash" : "Recycle Bin";

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDateTime(ms: number): string {
  if (!ms) return "—";
  const date = new Date(ms);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? `Today ${time}` : `${formatDate(ms)}, ${time}`;
}

/** "3 days ago", "in 5 weeks" — for release countdowns and recency. */
export function formatRelative(ms: number): string {
  const days = Math.round((ms - Date.now()) / (24 * 60 * 60 * 1000));
  const abs = Math.abs(days);
  const [n, unit] =
    abs < 1 ? [0, "today"] : abs < 14 ? [abs, "day"] : abs < 60 ? [Math.round(abs / 7), "week"] : [Math.round(abs / 30), "month"];
  if (unit === "today") return "today";
  const label = `${n} ${unit}${n === 1 ? "" : "s"}`;
  return days < 0 ? `${label} ago` : `in ${label}`;
}

export function formatDate(ms: number): string {
  if (!ms) return "—";
  const date = new Date(ms);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
