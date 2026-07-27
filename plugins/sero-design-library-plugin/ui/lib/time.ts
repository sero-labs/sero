const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the shortest form that is still exact enough to act on.
 *
 * Shared by every panel that timestamps something — a reference's last edit, a
 * revision, a tweak checkpoint — because two panels rounding the same moment
 * differently is a difference the user has to work out is meaningless.
 */
export function relativeTime(timestamp: number, now: number): string {
  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}
