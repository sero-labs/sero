import { describe, expect, it, vi } from 'vitest';

import type { CronState, Reminder } from '../../shared/types';
import { DEFAULT_CRON_STATE } from '../../shared/types';
import { prepareRecoveryBootstrap } from '../recovery-runtime';

vi.mock('../logger', () => ({
  info: vi.fn(),
}));

function makeState(overrides?: Partial<CronState>): CronState {
  return {
    ...DEFAULT_CRON_STATE,
    jobs: [],
    reminders: [],
    lastRunResults: [],
    ...overrides,
  };
}

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: 'reminder-1',
    title: 'Standup',
    type: 'once',
    channel: 'notification',
    status: 'active',
    createdAt: '2025-06-15T08:00:00Z',
    fireAt: new Date(Date.now() - 60_000).toISOString(),
    recoverIfMissed: true,
    ...overrides,
  };
}

describe('prepareRecoveryBootstrap', () => {
  it('marks missed reminders as fired before the scheduler starts', () => {
    const notifyReminder = vi.fn();
    const reminder = makeReminder();
    const result = prepareRecoveryBootstrap(
      makeState({
        lastSchedulerShutdown: new Date(Date.now() - 10 * 60_000).toISOString(),
        reminders: [reminder],
      }),
      { notifyReminder },
    );

    expect(notifyReminder).toHaveBeenCalledTimes(1);
    expect(result.state.reminders[0]?.status).toBe('completed');
    expect(result.state.reminders[0]?.lastFiredAt).toBeTruthy();
    expect(result.startOpts?.lastTickMinute).toBeTruthy();
  });

  it('queues missed jobs once and advances the scheduler minute watermark', () => {
    const notifyReminder = vi.fn();
    const result = prepareRecoveryBootstrap(
      makeState({
        lastSchedulerShutdown: new Date(Date.now() - 10 * 60_000).toISOString(),
        jobs: [{
          name: 'daily-report',
          schedule: '* * * * *',
          prompt: 'report',
          channel: 'cron',
          disabled: false,
          runIfMissed: true,
        }],
      }),
      { notifyReminder },
    );

    expect(notifyReminder).not.toHaveBeenCalled();
    expect(result.missedJobNames).toEqual(['daily-report']);
    expect(result.state.lastTickMinute).toBe(result.startOpts?.lastTickMinute);
  });
});
