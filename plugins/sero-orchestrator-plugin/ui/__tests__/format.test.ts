import { describe, expect, it } from 'vitest';
import { LOOP_STATUS_LABEL, loopStatusVariant, stepStatusVariant, formatTime } from '../lib/format';

describe('UI format helpers', () => {
  it('labels every loop status', () => {
    expect(LOOP_STATUS_LABEL.active).toBe('Active');
    expect(LOOP_STATUS_LABEL.blocked).toBe('Blocked');
    expect(LOOP_STATUS_LABEL.complete).toBe('Complete');
    expect(LOOP_STATUS_LABEL.disabled).toBe('Disabled');
  });

  it('maps loop status to a badge variant', () => {
    expect(loopStatusVariant('blocked')).toBe('destructive');
    expect(loopStatusVariant('active')).toBe('default');
    expect(loopStatusVariant('draft')).toBe('outline');
    expect(loopStatusVariant('disabled')).toBe('outline');
  });

  it('maps step status to a badge variant', () => {
    expect(stepStatusVariant('failed')).toBe('destructive');
    expect(stepStatusVariant('succeeded')).toBe('secondary');
    expect(stepStatusVariant('running')).toBe('default');
  });

  it('formats time and tolerates empty/invalid input', () => {
    expect(formatTime(undefined)).toBe('—');
    expect(formatTime('not-a-date')).toBe('not-a-date');
    expect(formatTime('2026-06-22T10:00:00.000Z')).not.toBe('—');
  });
});
