/** Human-readable byte size, matching the host's capture report. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '0B';
  const value = Math.max(0, Math.round(bytes));
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${(value / (1024 * 1024)).toFixed(1)}MB`;
}
