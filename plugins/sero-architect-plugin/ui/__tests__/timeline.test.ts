/**
 * Inspector timeline logic (spec architect-run-observability).
 *
 * The two load-bearing properties: a long trace renders a bounded number of rows
 * whatever the scroll position, and a value nobody reported is never invented.
 */

import { describe, expect, it } from 'vitest';
import { panRange, rangeOf, rowWindow, ticks, zoomRange } from '../lib/timeline';

describe('bounded rendering', () => {
  it('never renders more rows than the viewport and its overscan, at any scroll position', () => {
    const total = 50_000;
    const viewportHeight = 460;
    const rowHeight = 34;
    const limit = Math.ceil(viewportHeight / rowHeight) + 12;
    for (const scrollTop of [0, 1, 10_000, 850_000, 1_700_000, 10_000_000]) {
      const window = rowWindow(total, { scrollTop, rowHeight, viewportHeight });
      expect(window.end - window.start).toBeLessThanOrEqual(limit);
      expect(window.start).toBeGreaterThanOrEqual(0);
      expect(window.end).toBeLessThanOrEqual(total);
    }
  });

  it('stops at the end instead of scrolling past the last row', () => {
    const window = rowWindow(100, { scrollTop: 99_999, rowHeight: 34, viewportHeight: 460 });
    expect(window.end).toBe(100);
    expect(window.start).toBeLessThan(100);
    expect(window.total).toBe(100);
  });

  it('renders nothing rather than guessing when the geometry is unknown', () => {
    expect(rowWindow(100, { scrollTop: 0, rowHeight: 0, viewportHeight: 460 }).end).toBe(0);
    expect(rowWindow(0, { scrollTop: 0, rowHeight: 34, viewportHeight: 460 }).end).toBe(0);
  });
});

describe('time range', () => {
  it('is null when the run has no usable time, rather than an empty range', () => {
    expect(rangeOf(null)).toBeNull();
    expect(rangeOf({ from: 'not a time', to: 'x' })).toBeNull();
  });

  it('pans without resizing and stops at either end', () => {
    const full = { from: 0, to: 100_000 };
    expect(panRange(full, { from: 10_000, to: 30_000 }, 5_000)).toEqual({ from: 15_000, to: 35_000 });
    expect(panRange(full, { from: 10_000, to: 30_000 }, -50_000)).toEqual({ from: 0, to: 20_000 });
    expect(panRange(full, { from: 10_000, to: 30_000 }, 500_000)).toEqual({ from: 80_000, to: 100_000 });
  });

  it('marks the ruler at a round interval measured from the start of the run', () => {
    const marks = ticks({ from: 0, to: 3 * 3_600_000 }, 0);
    expect(marks.map((mark) => mark.offset / 60_000)).toEqual([0, 30, 60, 90, 120, 150, 180]);
  });

  it('zooms around an anchor and stops at the whole run when zooming out', () => {
    const full = { from: 0, to: 100_000 };
    const zoomed = zoomRange(full, full, 0.5, 50_000);
    expect(zoomed.to - zoomed.from).toBeCloseTo(50_000);
    // The anchor stays put relative to the new range.
    expect((50_000 - zoomed.from) / (zoomed.to - zoomed.from)).toBeCloseTo(0.5);
    // Zooming out past the whole run clamps to it rather than inverting.
    const out = zoomRange(full, { from: 10_000, to: 20_000 }, 100, 15_000);
    expect(out).toEqual(full);
  });

  it('never leaves the full range when the anchor sits at an edge', () => {
    const full = { from: 1_000, to: 2_000 };
    const atStart = zoomRange(full, full, 0.5, 1_000);
    expect(atStart.from).toBeGreaterThanOrEqual(full.from);
    expect(atStart.to).toBeLessThanOrEqual(full.to);
    const atEnd = zoomRange(full, full, 0.5, 2_000);
    expect(atEnd.from).toBeGreaterThanOrEqual(full.from);
    expect(atEnd.to).toBeLessThanOrEqual(full.to);
  });
});
