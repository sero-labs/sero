// Status labels + colours now live in ui/lib/status-style.ts (the wireframe state
// language). This module keeps only value formatting (time/duration/cost).

export function formatTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** Compact relative time: "just now", "5m ago", "2h ago", "3d ago". */
export function formatRelative(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.round((Date.now() - then) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

/** Compact human duration: "820 ms", "4.2s", "1m 20s", "2h 5m". */
export function formatDuration(ms?: number): string {
  if (ms === undefined || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    const rem = Math.round(seconds % 60);
    return rem ? `${totalMinutes}m ${rem}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** USD with cents, extending to 4 dp for sub-cent amounts. */
export function formatCost(usd?: number): string {
  if (usd === undefined) return '—';
  return usd.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: usd < 0.1 ? 4 : 2,
  });
}
