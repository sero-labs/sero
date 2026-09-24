/**
 * Inspector display formats. An unmeasured value is a word, never a zero, so
 * none of these is ever called with a guess.
 */

/** Two decimals. A non-zero amount under half a cent says so instead of $0.00. */
export const usd = (value: number): string => (value !== 0 && Math.abs(value) < 0.005 ? '<$0.01' : `$${value.toFixed(2)}`);

/** A duration, as short as it can be without losing the unit that matters. */
export const dur = (value: number): string => {
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes * 10) / 10}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${Math.round(minutes - hours * 60)}m`;
};

/** Local wall-clock time, hours and minutes. */
export const clock = (at: string | null): string => {
  const parsed = at === null ? Number.NaN : Date.parse(at);
  if (!Number.isFinite(parsed)) return 'unavailable';
  const date = new Date(parsed);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (at: string): string => {
  const date = new Date(Date.parse(at));
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

/**
 * A time range. Both ends carry their date when the range crosses a day, so
 * five days never read as `23:04 → 22:28`. An end still running reads `open`.
 */
export const span = (from: string, to: string | null): string => {
  if (to === null) return `${clock(from)} → open`;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || new Date(a).toDateString() === new Date(b).toDateString()) return `${clock(from)} → ${clock(to)}`;
  return `${day(from)} ${clock(from)} → ${day(to)} ${clock(to)}`;
};

export const count = (value: number): string => value.toLocaleString('en-US');

/** Token counts, compact: 14.3k, 117k. */
export const tokens = (value: number): string => {
  if (value < 1000) return String(value);
  if (value < 100_000) return `${Math.round(value / 100) / 10}k`;
  return `${Math.round(value / 1000)}k`;
};
