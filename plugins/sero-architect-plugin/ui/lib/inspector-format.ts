export const ms = (value: number): string => {
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`;
};
export const usd = (value: number): string => `$${value.toFixed(4)}`;
export const clock = (at: string): string => {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(11, 23) : '--';
};
