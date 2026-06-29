import { describe, expect, it } from 'vitest';
import { formatCost, formatTime, formatTokens } from '../lib/format';
import { LOOP_STATUS_STYLE, STEP_STATUS_STYLE } from '../lib/status-style';
import type { LoopStatus, StepStatus } from '../../shared/types';

const LOOP_STATUSES: LoopStatus[] = ['draft', 'active', 'blocked', 'complete', 'disabled'];
const STEP_STATUSES: StepStatus[] = ['pending', 'ready', 'running', 'succeeded', 'blocked', 'failed', 'needs-revision', 'skipped'];

describe('UI format helpers', () => {
  it('formats time and tolerates empty/invalid input', () => {
    expect(formatTime(undefined)).toBe('—');
    expect(formatTime('not-a-date')).toBe('not-a-date');
    expect(formatTime('2026-06-22T10:00:00.000Z')).not.toBe('—');
  });

  it('formats token counts compactly with a k/M suffix', () => {
    expect(formatTokens(undefined)).toBe('—');
    expect(formatTokens(920)).toBe('920');
    expect(formatTokens(45200)).toBe('45.2k');
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });

  it('formats cost with extra precision for sub-cent amounts', () => {
    expect(formatCost(undefined)).toBe('—');
    expect(formatCost(1.2)).toBe('$1.20');
    expect(formatCost(0.0123)).toBe('$0.0123');
  });
});

describe('status visual language', () => {
  it('labels every loop status', () => {
    expect(LOOP_STATUS_STYLE.active.label).toBe('Active');
    expect(LOOP_STATUS_STYLE.blocked.label).toBe('Blocked');
    expect(LOOP_STATUS_STYLE.complete.label).toBe('Complete');
    expect(LOOP_STATUS_STYLE.disabled.label).toBe('Disabled');
  });

  it('has a complete style entry (label + dot + badge) for every status', () => {
    for (const status of LOOP_STATUSES) {
      const style = LOOP_STATUS_STYLE[status];
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.dot).toBeTruthy();
      expect(style.badge).toBeTruthy();
    }
    for (const status of STEP_STATUSES) {
      const style = STEP_STATUS_STYLE[status];
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.dot).toBeTruthy();
    }
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
