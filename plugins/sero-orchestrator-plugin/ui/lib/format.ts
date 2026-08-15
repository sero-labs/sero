// Status labels + colours now live in ui/lib/status-style.ts (the wireframe state
// language). This module keeps only value formatting (time/duration/cost).

export function formatTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** Wall-clock time of day — the timeline's `14:02` column. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
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

/** Compact token count: "920", "4.2k", "1.2M". */
export function formatTokens(n?: number): string {
  if (n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/** Elapsed working time at minute resolution — `41m`, `1h 12m` (prototype meta). */
export function formatElapsed(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/**
 * USD with cents, extending to 4 dp for sub-cent amounts. A plain `$` prefix
 * on every locale — `toLocaleString` renders `US$` outside the US, which
 * turns every meter and row meta into noise (prototype: `$3.18 / $6.00`).
 */
export function formatCost(usd?: number): string {
  if (usd === undefined) return '—';
  if (usd > 0 && usd < 0.1) return `$${usd.toFixed(4).replace(/0{1,2}$/, '')}`;
  return `$${usd.toFixed(2)}`;
}
