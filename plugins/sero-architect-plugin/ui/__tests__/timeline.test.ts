/**
 * Inspector timeline logic (spec architect-run-observability).
 *
 * The two load-bearing properties: a long trace renders a bounded number of rows
 * whatever the scroll position, and a value nobody reported is never invented.
 */

import { describe, expect, it } from 'vitest';
import {
  activityOf, activityOptions, filterRecords, filtersActive, inRange, modelOptions, NO_FILTERS,
  rowWindow, timeRangeOf, zoomRange,
} from '../lib/timeline';
import type { TraceRecord } from '../lib/trace';

const at = (offsetMs: number): string => new Date(Date.parse('2026-09-14T09:00:00.000Z') + offsetMs).toISOString();
const record = (overrides: Partial<TraceRecord> & { seq: number }): TraceRecord => ({
  at: at(overrides.seq * 1000), kind: 'observation', ...overrides,
});

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

describe('filtering', () => {
  const records = [
    record({ seq: 0, operationKind: 'workflow', model: 'openai-codex/gpt-5.6-terra' }),
    record({ seq: 1, operationKind: 'evidence', model: 'openai-codex/gpt-5.6-terra' }),
    record({ seq: 2, operationKind: 'research', model: 'openai-codex/gpt-5.6-luna', outcome: 'failed' }),
  ];

  it('passes everything through when no filter is set', () => {
    expect(filtersActive(NO_FILTERS)).toBe(false);
    expect(filterRecords(records, NO_FILTERS)).toHaveLength(3);
  });

  it('keeps the named activities and models', () => {
    expect(filterRecords(records, { ...NO_FILTERS, activities: ['research'] }).map((entry) => entry.seq)).toEqual([2]);
    expect(filterRecords(records, { ...NO_FILTERS, models: ['openai-codex/gpt-5.6-terra'] }).map((entry) => entry.seq)).toEqual([0, 1]);
  });

  it('keeps only records that reported a failure', () => {
    expect(filterRecords(records, { ...NO_FILTERS, failuresOnly: true }).map((entry) => entry.seq)).toEqual([2]);
  });

  it('combines filters rather than widening when they disagree', () => {
    const both = filterRecords(records, { activities: ['workflow'], models: ['openai-codex/gpt-5.6-luna'], failuresOnly: false });
    expect(both).toEqual([]);
  });

  it('lists the activities and models that are present', () => {
    expect(activityOptions(records)).toEqual(['evidence', 'research', 'workflow']);
    expect(modelOptions(records)).toEqual(['openai-codex/gpt-5.6-luna', 'openai-codex/gpt-5.6-terra']);
    // A record with no model contributes no option, so the control never offers a blank.
    expect(modelOptions([record({ seq: 9 })])).toEqual([]);
  });

  it('falls back to the source, then the kind, when a record has no operation kind', () => {
    expect(activityOf(record({ seq: 0, source: 'session' }))).toBe('session');
    expect(activityOf(record({ seq: 0 }))).toBe('observation');
  });
});

describe('time range', () => {
  it('is null when nothing carries a usable time, rather than an empty range', () => {
    expect(timeRangeOf([])).toBeNull();
    expect(timeRangeOf([{ seq: 0, at: 'not a time', kind: 'observation' }])).toBeNull();
  });

  it('covers the first and last observed record', () => {
    const range = timeRangeOf([record({ seq: 1 }), record({ seq: 5 })]);
    expect(range).toEqual({ from: Date.parse(at(1000)), to: Date.parse(at(5000)) });
  });

  it('keeps a record with no time visible instead of dropping it', () => {
    expect(inRange({ seq: 0, at: 'not a time', kind: 'observation' }, { from: 0, to: 1 })).toBe(true);
    expect(inRange(record({ seq: 5 }), { from: 0, to: 1 })).toBe(false);
    expect(inRange(record({ seq: 5 }), null)).toBe(true);
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
