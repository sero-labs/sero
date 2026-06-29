import { describe, expect, it } from 'vitest';
import { formatTime } from '../lib/format';
import { LOOP_STATUS_STYLE, STEP_STATUS_STYLE } from '../lib/status-style';

describe('UI format helpers', () => {
  it('formats time and tolerates empty/invalid input', () => {
    expect(formatTime(undefined)).toBe('—');
    expect(formatTime('not-a-date')).toBe('not-a-date');
    expect(formatTime('2026-06-22T10:00:00.000Z')).not.toBe('—');
  });
});

describe('status visual language', () => {
  it('labels every loop status', () => {
    expect(LOOP_STATUS_STYLE.active.label).toBe('Active');
    expect(LOOP_STATUS_STYLE.blocked.label).toBe('Blocked');
    expect(LOOP_STATUS_STYLE.complete.label).toBe('Complete');
    expect(LOOP_STATUS_STYLE.disabled.label).toBe('Disabled');
  });

  it('presents the data step statuses with the wireframe labels', () => {
    expect(STEP_STATUS_STYLE.succeeded.label).toBe('done');
    expect(STEP_STATUS_STYLE['needs-revision'].label).toBe('recovering');
    expect(STEP_STATUS_STYLE.running.label).toBe('running');
  });

  it('gives running and done a green accent, failed a red one', () => {
    expect(STEP_STATUS_STYLE.running.dot).toContain('emerald');
    expect(STEP_STATUS_STYLE.succeeded.dot).toContain('emerald');
    expect(STEP_STATUS_STYLE.failed.dot).toContain('rose');
  });
});
