/**
 * Shared time formatting for Sero UIs. Renderer-safe (no Node imports).
 */

/**
 * Compact relative time: "just now", "5m ago", "2h ago", "3d ago".
 * Accepts an epoch millisecond number, an ISO string, or a Date.
 * Returns "" for an unparseable input.
 */
export function relativeTime(input: number | string | Date): string {
  const ms =
    input instanceof Date
      ? input.getTime()
      : typeof input === 'number'
        ? input
        : new Date(input).getTime();
  if (Number.isNaN(ms)) return '';

  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
