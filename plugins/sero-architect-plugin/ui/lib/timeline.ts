/**
 * Inspector timeline geometry (spec architect-run-observability).
 *
 * The row window keeps a long trace cheap: a trace with fifty thousand rows
 * renders the rows on screen and nothing else, so scrolling never grows the DOM.
 * A range with no timestamps is null rather than empty, so the view can say
 * "unavailable" instead of drawing a flat line at zero.
 */

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

/** The run's observed span, or null when no record carried a usable time. */
export function rangeOf(elapsed: { from: string; to: string } | null): TimeRange | null {
  if (!elapsed) return null;
  const from = Date.parse(elapsed.from);
  const to = Date.parse(elapsed.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // A run with one observation still gets a visible second of width.
  return { from, to: Math.max(to, from + 1000) };
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

/** Moves a range without resizing it, stopping at either end of the full range. */
export function panRange(full: TimeRange, current: TimeRange, deltaMs: number): TimeRange {
  const width = current.to - current.from;
  const from = Math.max(full.from, Math.min(current.from + deltaMs, full.to - width));
  return { from, to: from + width };
}

/** True when a range shows the whole run, so it can be stored as "no zoom". */
export const isWhole = (full: TimeRange, range: TimeRange): boolean => range.from <= full.from && range.to >= full.to;

const STEPS = [1, 5, 10, 30, 60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map((seconds) => seconds * 1000);

/** Ruler marks at a round interval: about five across whatever is shown. */
export function ticks(range: TimeRange, origin: number): { at: number; offset: number }[] {
  const span = range.to - range.from;
  const step = STEPS.find((candidate) => span / candidate <= 6) ?? STEPS[STEPS.length - 1]!;
  const marks: { at: number; offset: number }[] = [];
  for (let offset = Math.ceil((range.from - origin) / step) * step; origin + offset <= range.to; offset += step) {
    marks.push({ at: ((origin + offset - range.from) / span) * 100, offset });
  }
  return marks;
}

/** Where an interval sits in a range, as percentages. Null when it is outside. */
export function barGeometry(range: TimeRange, from: number, to: number): { left: number; width: number } | null {
  const span = range.to - range.from;
  const start = Math.max(from, range.from);
  const end = Math.min(to, range.to);
  if (end < range.from || start > range.to) return null;
  return { left: ((start - range.from) / span) * 100, width: Math.max(0.4, ((end - start) / span) * 100) };
}
