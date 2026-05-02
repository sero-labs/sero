/**
 * Tests for reminder tool action handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CronState, Reminder } from '../../shared/types';
import { DEFAULT_CRON_STATE } from '../../shared/types';
import {
  handleReminderList,
  handleReminderAdd,
  handleReminderUpdate,
  handleReminderRemove,
  handleReminderSnooze,
  handleReminderComplete,
  handleReminderToggle,
  type ReminderActionDeps,
} from '../reminder-actions';

// Mock logger
vi.mock('../logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeReminder(overrides?: Partial<Reminder>): Reminder {
  return {
    id: 'r1',
    title: 'Test Reminder',
    channel: 'notification',
    type: 'once',
    status: 'active',
    createdAt: '2025-06-15T08:00:00Z',
    ...overrides,
  };
}

function makeState(overrides?: Partial<CronState>): CronState {
  return {
    ...DEFAULT_CRON_STATE,
    jobs: [],
    reminders: [],
    lastRunResults: [],
    ...overrides,
  };
}

function makeDeps(overrides?: Partial<ReminderActionDeps>): ReminderActionDeps {
  return {
    state: makeState(),
    statePath: '/tmp/test-state.json',
    writeState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── handleReminderList ──────────────────────────────────────────

describe('handleReminderList', () => {
  it('returns message when no reminders exist', () => {
    expect(handleReminderList(makeDeps())).toBe('No reminders set.');
  });

  it('groups reminders by status', () => {
    const deps = makeDeps({
      state: makeState({
        reminders: [
          makeReminder({ id: 'a', title: 'Active', status: 'active' }),
          makeReminder({ id: 'b', title: 'Done', status: 'completed' }),
          makeReminder({ id: 'c', title: 'Off', status: 'disabled' }),
        ],
      }),
    });
    const result = handleReminderList(deps);
    expect(result).toContain('Active Reminders');
    expect(result).toContain('Completed');
    expect(result).toContain('Disabled');
  });

  it('shows snoozed reminders in active group', () => {
    const deps = makeDeps({
      state: makeState({
        reminders: [
          makeReminder({ id: 'a', title: 'Snoozed', status: 'snoozed' }),
        ],
      }),
    });
    const result = handleReminderList(deps);
    expect(result).toContain('Active Reminders');
    expect(result).toContain('Snoozed');
  });

  it('truncates long completed lists', () => {
    const reminders = Array.from({ length: 10 }, (_, i) =>
      makeReminder({ id: `c${i}`, title: `Done ${i}`, status: 'completed' }),
    );
    const deps = makeDeps({ state: makeState({ reminders }) });
    const result = handleReminderList(deps);
    expect(result).toContain('...and 5 more');
  });
});

// ── handleReminderAdd ───────────────────────────────────────────

describe('handleReminderAdd', () => {
  it('adds a one-time reminder', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'Water plants', fire_at: '2025-06-15T18:00:00Z' },
      deps,
    );
    expect(result).toContain('Reminder set');
    expect(result).toContain('Water plants');
    expect(deps.state.reminders).toHaveLength(1);
    expect(deps.state.reminders[0].type).toBe('once');
    expect(deps.state.reminders[0].fireAt).toBeTruthy();
    expect(deps.writeState).toHaveBeenCalled();
  });

  it('adds a recurring reminder', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'Standup', type: 'recurring', schedule: '0 9 * * 1-5' },
      deps,
    );
    expect(result).toContain('Reminder set');
    expect(deps.state.reminders[0].type).toBe('recurring');
    expect(deps.state.reminders[0].schedule).toBe('0 9 * * 1-5');
  });

  it('rejects missing title', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd({ action: 'add' }, deps);
    expect(result).toContain('title is required');
  });

  it('rejects one-time without fire_at', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'X', type: 'once' },
      deps,
    );
    expect(result).toContain('fire_at');
  });

  it('rejects invalid fire_at', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'X', fire_at: 'not-a-date' },
      deps,
    );
    expect(result).toContain('invalid fire_at');
  });

  it('rejects recurring without schedule', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'X', type: 'recurring' },
      deps,
    );
    expect(result).toContain('schedule');
  });

  it('rejects invalid cron schedule', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'X', type: 'recurring', schedule: 'bad' },
      deps,
    );
    expect(result).toContain('invalid cron');
  });

  it('rejects email channel', async () => {
    const deps = makeDeps();
    const result = await handleReminderAdd(
      { action: 'add', title: 'X', fire_at: '2025-06-15T18:00:00Z', channel: 'email' },
      deps,
    );
    expect(result).toContain('not yet supported');
  });

  it('generates a unique ID', async () => {
    const deps = makeDeps();
    await handleReminderAdd(
      { action: 'add', title: 'X', fire_at: '2025-06-15T18:00:00Z' },
      deps,
    );
    expect(deps.state.reminders[0].id).toHaveLength(8);
  });

  it('normalises fire_at to ISO UTC', async () => {
    const deps = makeDeps();
    await handleReminderAdd(
      { action: 'add', title: 'X', fire_at: '2025-06-15T18:00:00' },
      deps,
    );
    expect(deps.state.reminders[0].fireAt).toContain('Z');
  });
});

// ── handleReminderUpdate ────────────────────────────────────────

describe('handleReminderUpdate', () => {
  it('updates reminder fields', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder({ id: 'r1', title: 'Old' })] }),
    });
    const result = await handleReminderUpdate(
      { action: 'update', id: 'r1', title: 'New Title', notes: 'Updated notes' },
      deps,
    );
    expect(result).toContain('Updated');
    expect(deps.state.reminders[0].title).toBe('New Title');
    expect(deps.state.reminders[0].notes).toBe('Updated notes');
  });

  it('rejects missing id', async () => {
    const deps = makeDeps();
    expect(await handleReminderUpdate({ action: 'update' }, deps)).toContain('id is required');
  });

  it('rejects unknown id', async () => {
    const deps = makeDeps();
    expect(await handleReminderUpdate({ action: 'update', id: 'nope' }, deps)).toContain('not found');
  });

  it('validates new fire_at', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    const result = await handleReminderUpdate(
      { action: 'update', id: 'r1', fire_at: 'bad' },
      deps,
    );
    expect(result).toContain('invalid fire_at');
  });

  it('validates new schedule', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    const result = await handleReminderUpdate(
      { action: 'update', id: 'r1', schedule: 'bad' },
      deps,
    );
    expect(result).toContain('invalid cron');
  });

  it('clears notes when set to empty string', async () => {
    const deps = makeDeps({
      state: makeState({
        reminders: [makeReminder({ notes: 'old notes' })],
      }),
    });
    await handleReminderUpdate({ action: 'update', id: 'r1', notes: '' }, deps);
    expect(deps.state.reminders[0].notes).toBeUndefined();
  });
});

// ── handleReminderRemove ────────────────────────────────────────

describe('handleReminderRemove', () => {
  it('removes reminder by id', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    const result = await handleReminderRemove({ action: 'remove', id: 'r1' }, deps);
    expect(result).toContain('Removed');
    expect(deps.state.reminders).toHaveLength(0);
  });

  it('rejects missing id', async () => {
    expect(await handleReminderRemove({ action: 'remove' }, makeDeps())).toContain('id is required');
  });

  it('rejects unknown id', async () => {
    expect(await handleReminderRemove({ action: 'remove', id: 'x' }, makeDeps())).toContain('not found');
  });
});

// ── handleReminderSnooze ────────────────────────────────────────

describe('handleReminderSnooze', () => {
  it('snoozes a reminder with default 15 minutes', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    const result = await handleReminderSnooze({ action: 'snooze', id: 'r1' }, deps);
    expect(result).toContain('Snoozed');
    expect(deps.state.reminders[0].status).toBe('snoozed');
    expect(deps.state.reminders[0].snoozedUntil).toBeTruthy();
  });

  it('snoozes for specified minutes', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    await handleReminderSnooze({ action: 'snooze', id: 'r1', snooze_minutes: 60 }, deps);
    const until = new Date(deps.state.reminders[0].snoozedUntil!).getTime();
    // Should be ~60 minutes in the future
    expect(until).toBeGreaterThan(Date.now() + 59 * 60_000);
  });

  it('rejects missing id', async () => {
    expect(await handleReminderSnooze({ action: 'snooze' }, makeDeps())).toContain('id is required');
  });

  it('rejects unknown id', async () => {
    expect(await handleReminderSnooze({ action: 'snooze', id: 'x' }, makeDeps())).toContain('not found');
  });
});

// ── handleReminderComplete ──────────────────────────────────────

describe('handleReminderComplete', () => {
  it('marks reminder as completed', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    const result = await handleReminderComplete({ action: 'complete', id: 'r1' }, deps);
    expect(result).toContain('Completed');
    expect(deps.state.reminders[0].status).toBe('completed');
    expect(deps.state.reminders[0].completedAt).toBeTruthy();
  });

  it('clears snoozedUntil on complete', async () => {
    const deps = makeDeps({
      state: makeState({
        reminders: [makeReminder({ status: 'snoozed', snoozedUntil: '2025-06-15T10:00:00Z' })],
      }),
    });
    await handleReminderComplete({ action: 'complete', id: 'r1' }, deps);
    expect(deps.state.reminders[0].snoozedUntil).toBeUndefined();
  });

  it('prunes old completed reminders over limit', async () => {
    // Create 105 completed + 1 active
    const reminders: Reminder[] = [makeReminder({ id: 'active-1' })];
    for (let i = 0; i < 105; i++) {
      reminders.push(
        makeReminder({
          id: `c-${i}`,
          status: 'completed',
          completedAt: new Date(2025, 0, 1 + i).toISOString(),
        }),
      );
    }
    const deps = makeDeps({ state: makeState({ reminders }) });
    await handleReminderComplete({ action: 'complete', id: 'active-1' }, deps);

    const completed = deps.state.reminders.filter((r) => r.status === 'completed');
    expect(completed.length).toBeLessThanOrEqual(100);
  });

  it('rejects missing id', async () => {
    expect(await handleReminderComplete({ action: 'complete' }, makeDeps())).toContain('id is required');
  });
});

// ── handleReminderToggle ────────────────────────────────────────

describe('handleReminderToggle', () => {
  it('disables a reminder', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder()] }),
    });
    const result = await handleReminderToggle({ action: 'disable', id: 'r1' }, deps, true);
    expect(result).toContain('Disabled');
    expect(deps.state.reminders[0].status).toBe('disabled');
  });

  it('enables a disabled reminder', async () => {
    const deps = makeDeps({
      state: makeState({ reminders: [makeReminder({ status: 'disabled' })] }),
    });
    const result = await handleReminderToggle({ action: 'enable', id: 'r1' }, deps, false);
    expect(result).toContain('Enabled');
    expect(deps.state.reminders[0].status).toBe('active');
  });

  it('clears snoozedUntil when enabling', async () => {
    const deps = makeDeps({
      state: makeState({
        reminders: [makeReminder({ status: 'disabled', snoozedUntil: '2025-06-15T10:00:00Z' })],
      }),
    });
    await handleReminderToggle({ action: 'enable', id: 'r1' }, deps, false);
    expect(deps.state.reminders[0].snoozedUntil).toBeUndefined();
  });

  it('rejects missing id', async () => {
    expect(await handleReminderToggle({ action: 'toggle' }, makeDeps(), true)).toContain('id is required');
  });

  it('rejects unknown id', async () => {
    expect(await handleReminderToggle({ action: 'toggle', id: 'x' }, makeDeps(), true)).toContain('not found');
  });
});
