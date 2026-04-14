import { describe, expect, it } from 'vitest';

import { DEFAULT_CRON_STATE } from '../types';
import type { CronState, Reminder } from '../types';
import {
  completeReminderById,
  toggleReminderDisabledState,
  upsertReminder,
  validateReminderChannel,
} from '../reminder-mutations';

function makeState(reminders: Reminder[] = []): CronState {
  return {
    ...DEFAULT_CRON_STATE,
    jobs: [],
    reminders,
    lastRunResults: [],
  };
}

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1',
    title: 'Test reminder',
    channel: 'notification',
    type: 'once',
    status: 'active',
    createdAt: '2026-04-14T10:00:00.000Z',
    fireAt: '2026-04-14T11:00:00.000Z',
    ...overrides,
  };
}

describe('reminder-mutations', () => {
  it('rejects the unsupported email channel', () => {
    expect(validateReminderChannel('email')).toEqual({
      ok: false,
      error:
        'Error: email channel is not yet supported. Use "notification" (desktop) instead.',
    });
  });

  it('updates reminders in place when upserting', () => {
    const state = makeState([makeReminder()]);

    upsertReminder(state, makeReminder({ title: 'Updated title' }));

    expect(state.reminders).toHaveLength(1);
    expect(state.reminders[0]?.title).toBe('Updated title');
  });

  it('shares completion pruning semantics across callers', () => {
    const reminders = Array.from({ length: 105 }, (_, index) =>
      makeReminder({
        id: `done-${index}`,
        status: 'completed',
        completedAt: new Date(2026, 0, index + 1).toISOString(),
      }),
    );
    reminders.unshift(makeReminder({ id: 'active-1' }));
    const state = makeState(reminders);

    completeReminderById(state, 'active-1', '2026-04-14T12:00:00.000Z');

    expect(state.reminders.filter((entry) => entry.status === 'completed')).toHaveLength(100);
  });

  it('clears snooze state when re-enabling a reminder', () => {
    const state = makeState([
      makeReminder({
        id: 'snoozed-1',
        status: 'disabled',
        snoozedUntil: '2026-04-14T13:00:00.000Z',
      }),
    ]);

    const updated = toggleReminderDisabledState(state, 'snoozed-1', false);

    expect(updated?.status).toBe('active');
    expect(updated?.snoozedUntil).toBeUndefined();
  });
});
