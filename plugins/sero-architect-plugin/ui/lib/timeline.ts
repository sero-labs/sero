/**
 * Inspector timeline logic (spec architect-run-observability).
 *
 * Pure functions, so the rendering below stays a rendering. Two of these carry
 * rules worth stating.
 *
 * The window is what keeps a long trace cheap: a trace with fifty thousand spans
 * renders the rows on screen and nothing else, so scrolling never grows the DOM.
 *
 * An unknown value is never filled in. A record with no cost contributes no cost
 * rather than zero, and a range with no timestamps is null rather than an empty
 * range, so the view can say "not measured" instead of drawing a flat line at
 * zero and calling it data.
 */

import type { TraceRecord } from './trace';

export interface TraceFilters {
  /** Operation kinds to keep. Empty means every kind. */
  activities: readonly string[];
  /** Models to keep. Empty means every model. */
  models: readonly string[];
  /** Keep only records that reported a failure. */
  failuresOnly: boolean;
}

export const NO_FILTERS: TraceFilters = { activities: [], models: [], failuresOnly: false };

export function filtersActive(filters: TraceFilters): boolean {
  return filters.activities.length > 0 || filters.models.length > 0 || filters.failuresOnly;
}

/** The activity a record belongs to. A record with no kind is its own bucket. */
export function activityOf(record: TraceRecord): string {
  return record.operationKind ?? record.source ?? record.kind;
}

export function filterRecords(records: readonly TraceRecord[], filters: TraceFilters): TraceRecord[] {
  if (!filtersActive(filters)) return [...records];
  // Sets, so a filter over a long trace is not a scan per record per filter.
  const activities = new Set(filters.activities);
  const models = new Set(filters.models);
  return records.filter((record) => {
    if (activities.size > 0 && !activities.has(activityOf(record))) return false;
    if (models.size > 0 && !(record.model !== undefined && models.has(record.model))) return false;
    if (filters.failuresOnly && record.outcome !== 'failed' && record.outcome !== 'error') return false;
    return true;
  });
}

export interface RowWindow {
  /** First rendered index, inclusive. */
  start: number;
  /** Last rendered index, exclusive. */
  end: number;
  /** Rows above the window, so the scroll height stays truthful. */
  leading: number;
  total: number;
}

/**
 * The rows to render for a scroll position.
 *
 * `overscan` rows either side are included so a fast scroll does not show a gap.
 * The window never exceeds the viewport plus its overscan, whatever the total.
 */
export function rowWindow(
  total: number,
  options: { scrollTop: number; rowHeight: number; viewportHeight: number; overscan?: number },
): RowWindow {
  const { scrollTop, rowHeight, viewportHeight } = options;
  const overscan = options.overscan ?? 6;
  if (total <= 0 || rowHeight <= 0 || viewportHeight <= 0) return { start: 0, end: 0, leading: 0, total };
  const visible = Math.ceil(viewportHeight / rowHeight);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const start = Math.min(first, Math.max(0, total - 1));
  const end = Math.min(total, start + visible + overscan * 2);
  return { start, end, leading: start, total };
}

export interface TimeRange {
  /** Epoch milliseconds. */
  from: number;
  to: number;
}

/** The span the records cover, or null when none of them carries a usable time. */
export function timeRangeOf(records: readonly TraceRecord[]): TimeRange | null {
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const at = Date.parse(record.at);
    if (!Number.isFinite(at)) continue;
    from = Math.min(from, at);
    to = Math.max(to, at);
  }
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

/**
 * Narrows or widens a range around an anchor.
 *
 * The result never inverts and never leaves the full range, so zooming out at the
 * edge stops at the whole trace instead of scrolling past it.
 */
export function zoomRange(full: TimeRange, current: TimeRange, factor: number, anchor: number): TimeRange {
  const width = Math.max(1, current.to - current.from);
  const next = Math.min(Math.max(width * factor, 1000), Math.max(1000, full.to - full.from));
  const ratio = (anchor - current.from) / width;
  const from = Math.max(full.from, Math.min(anchor - next * ratio, full.to - next));
  return { from, to: Math.min(full.to, from + next) };
}

/** Whether a record falls inside a range. Records without a time stay visible. */
export function inRange(record: TraceRecord, range: TimeRange | null): boolean {
  if (!range) return true;
  const at = Date.parse(record.at);
  if (!Number.isFinite(at)) return true;
  return at >= range.from && at <= range.to;
}

/** The activity kinds present, for the filter control. */
export function activityOptions(records: readonly TraceRecord[]): string[] {
  return [...new Set(records.map(activityOf))].sort((a, b) => a.localeCompare(b));
}

/** The models present, in a stable order for the filter control. */
export function modelOptions(records: readonly TraceRecord[]): string[] {
  return [...new Set(records.map((record) => record.model).filter((model): model is string => typeof model === 'string'))]
    .sort((a, b) => a.localeCompare(b));
}
