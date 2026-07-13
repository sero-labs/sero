// Display formatting rules, shared by the extension (tool/CLI text output)
// and the UI. Specified in docs/specs/sero-usage-plugin-spec.md §4.3.

/** `-` when 0; 4 dp under $0.01; 2 dp under $10; 1 dp under $100; whole dollars above. */
export function formatCost(cost: number): string {
  if (cost === 0) return '-';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 10) return `$${cost.toFixed(2)}`;
  if (cost < 100) return `$${cost.toFixed(1)}`;
  return `$${Math.round(cost).toLocaleString()}`;
}

/** `-` when 0; raw under 1k; `1.2k` under 10k; `123k` under 1M; `1.4M` under 10M; `284M` above. */
export function formatTokens(count: number): string {
  if (count === 0) return '-';
  if (count < 1_000) return String(count);
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

/** `-` when 0; else locale-formatted (`4,148`). */
export function formatCount(count: number): string {
  if (count === 0) return '-';
  return count.toLocaleString();
}

/** `just now / N min ago / N h ago / local date`. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = now - timestamp;
  if (elapsed < 60_000) return 'just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Interval select labels: `Manual`, `5m`, `30m`, `1h`, `6h`, `12h`, `24h`. */
export function formatIntervalMinutes(minutes: number): string {
  if (minutes <= 0) return 'Manual';
  if (minutes < 60) return `${minutes}m`;
  return `${minutes / 60}h`;
}
