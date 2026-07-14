import { describe, expect, it } from 'vitest';
import type { OrchestratorIndexView } from '@sero-ai/common';
import { formatFireTime, orchestratorIndexPath, scheduledLoopRows } from './orchestrator-loops';

const index: OrchestratorIndexView = {
  loops: [
    {
      id: 'loop-1',
      title: 'Daily digest',
      status: 'active',
      updatedAt: '2026-07-01T09:00:00.000Z',
      snoozedUntil: '2026-07-01T10:00:00.000Z',
      schedules: [
        {
          triggerId: 'trig-1',
          type: 'cron',
          schedule: '0 9 * * *',
          nextFireAt: '2026-07-02T09:00:00.000Z',
          lastFireAt: '2026-07-01T09:00:00.000Z',
        },
      ],
    },
    {
      id: 'loop-2',
      title: 'PR watcher',
      status: 'active',
      updatedAt: '2026-07-01T09:00:00.000Z',
      // No schedules: event-only loop, must not appear.
    },
    {
      id: 'loop-3',
      title: 'Weekly report',
      status: 'disabled',
      updatedAt: '2026-07-01T09:00:00.000Z',
      schedules: [
        { triggerId: 'trig-3', type: 'hybrid', schedule: '0 8 * * 1', paused: true },
      ],
    },
    {
      id: 'loop-4',
      title: 'One-shot rollout',
      status: 'active',
      updatedAt: '2026-07-01T09:00:00.000Z',
      schedules: [
        { triggerId: 'trig-4', type: 'cron', schedule: '0 6 * * *', exhausted: true },
      ],
    },
    {
      id: 'loop-5',
      title: 'Proof moment miner',
      status: 'active',
      updatedAt: '2026-07-01T09:00:00.000Z',
      snoozedUntil: '2026-07-01T11:00:00.000Z',
    },
  ],
};

describe('orchestratorIndexPath', () => {
  it('builds the index path from the workspace root', () => {
    expect(orchestratorIndexPath('/ws')).toBe('/ws/.sero/apps/orchestrator/index.json');
  });

  it('is null without a workspace', () => {
    expect(orchestratorIndexPath('')).toBeNull();
  });
});

describe('scheduledLoopRows', () => {
  it('flattens only loops that carry schedules', () => {
    const rows = scheduledLoopRows(index);
    expect(rows.map((r) => r.loopId)).toEqual(['loop-1', 'loop-3', 'loop-4', 'loop-5']);
    expect(rows[0]).toMatchObject({
      kind: 'schedule',
      triggerId: 'trig-1',
      title: 'Daily digest',
      schedule: '0 9 * * *',
      firesOnEvents: false,
      scheduleDisabled: false,
      exhausted: false,
      nextFireAt: '2026-07-02T09:00:00.000Z',
      snoozedUntil: '2026-07-01T10:00:00.000Z',
    });
  });

  it('marks hybrid triggers as event-driven and carries the paused state', () => {
    const row = scheduledLoopRows(index)[1];
    expect(row).toMatchObject({ triggerId: 'trig-3', firesOnEvents: true, scheduleDisabled: true, exhausted: false, status: 'disabled' });
  });

  it('carries the exhausted state for triggers past their run limit', () => {
    const row = scheduledLoopRows(index)[2];
    expect(row).toMatchObject({ triggerId: 'trig-4', exhausted: true, scheduleDisabled: false });
  });

  it('includes a snoozed event-only loop without inventing a cron schedule', () => {
    expect(scheduledLoopRows(index)[3]).toEqual({
      kind: 'snooze',
      loopId: 'loop-5',
      title: 'Proof moment miner',
      status: 'active',
      snoozedUntil: '2026-07-01T11:00:00.000Z',
    });
  });

  it('is empty for a missing index', () => {
    expect(scheduledLoopRows(null)).toEqual([]);
  });
});

describe('formatFireTime', () => {
  it('falls back to the raw string for invalid dates', () => {
    expect(formatFireTime('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid ISO timestamp', () => {
    expect(formatFireTime('2026-07-02T09:00:00.000Z')).not.toBe('2026-07-02T09:00:00.000Z');
  });
});
