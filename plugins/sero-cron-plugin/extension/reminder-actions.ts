/**
 * Reminder tool action handlers.
 *
 * Each handler receives the current state + tool params and returns
 * a result message string. State writes happen here.
 */

import type { CronState, Reminder, ReminderChannel } from '../shared/types';
import { MAX_COMPLETED_REMINDERS } from '../shared/types';
import {
  generateId,
  snoozeReminder,
  statusLabel,
  nextFireDescription,
} from '../shared/reminder-utils';
import { cronToHuman, validateCron } from '../shared/cron';
import { info } from './logger';

export interface ReminderActionDeps {
  state: CronState;
  statePath: string;
  writeState: (filePath: string, state: CronState) => Promise<void>;
}

export interface ReminderParams {
  action: string;
  id?: string;
  title?: string;
  notes?: string;
  channel?: string;
  type?: string;
  fire_at?: string;
  schedule?: string;
  snooze_minutes?: number;
  recover_if_missed?: boolean;
}

// ── List ────────────────────────────────────────────────────────

export function handleReminderList(deps: ReminderActionDeps): string {
  const { state } = deps;
  const reminders = state.reminders ?? [];

  if (reminders.length === 0) {
    return 'No reminders set.';
  }

  const active = reminders.filter(
    (r) => r.status === 'active' || r.status === 'snoozed',
  );
  const completed = reminders.filter((r) => r.status === 'completed');
  const disabled = reminders.filter((r) => r.status === 'disabled');

  const lines: string[] = [];

  if (active.length > 0) {
    lines.push(`**Active Reminders (${active.length}):**`);
    for (const r of active) {
      const ch = r.channel !== 'notification' ? ` [${r.channel}]` : '';
      const sched = r.type === 'recurring' && r.schedule
        ? ` \`${r.schedule}\``
        : '';
      lines.push(
        `- **${r.title}** (${r.id}) ${statusLabel(r.status)}${ch}${sched}` +
        `\n  Next: ${nextFireDescription(r)}`,
      );
    }
  }

  if (disabled.length > 0) {
    lines.push(`\n**Disabled (${disabled.length}):**`);
    for (const r of disabled) {
      lines.push(`- ${r.title} (${r.id})`);
    }
  }

  if (completed.length > 0) {
    lines.push(`\n**Completed (${completed.length}):**`);
    for (const r of completed.slice(0, 5)) {
      lines.push(`- ${r.title} (${r.id})`);
    }
    if (completed.length > 5) {
      lines.push(`  ...and ${completed.length - 5} more`);
    }
  }

  return lines.join('\n');
}

// ── Add ─────────────────────────────────────────────────────────

export async function handleReminderAdd(
  params: ReminderParams,
  deps: ReminderActionDeps,
): Promise<string> {
  const { state, statePath, writeState } = deps;

  if (!params.title) {
    return 'Error: title is required.';
  }

  const type = (params.type as 'once' | 'recurring') ?? 'once';

  // Validate scheduling
  if (type === 'once') {
    if (!params.fire_at) {
      return 'Error: fire_at (ISO datetime) is required for one-time reminders.';
    }
    const fireDate = new Date(params.fire_at);
    if (isNaN(fireDate.getTime())) {
      return `Error: invalid fire_at datetime "${params.fire_at}".`;
    }
    // Normalize to ISO UTC (the agent may omit the Z suffix)
    params.fire_at = fireDate.toISOString();
  } else if (type === 'recurring') {
    if (!params.schedule) {
      return 'Error: schedule (cron expression) is required for recurring reminders.';
    }
    const err = validateCron(params.schedule);
    if (err) return `Error: invalid cron expression — ${err}`;
  }

  const chResult = validateChannel(params.channel);
  if (!chResult.ok) return chResult.error;
  const id = generateId();

  const reminder: Reminder = {
    id,
    title: params.title,
    notes: params.notes,
    channel: chResult.channel,
    type,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  if (type === 'once') reminder.fireAt = params.fire_at;
  if (type === 'recurring') reminder.schedule = params.schedule;
  if (params.recover_if_missed) reminder.recoverIfMissed = true;

  if (!state.reminders) state.reminders = [];
  state.reminders.push(reminder);
  await writeState(statePath, state);

  info('reminder:add', { id, title: params.title, type, channel: chResult.channel });

  const when = type === 'once'
    ? `at ${params.fire_at}`
    : `on schedule ${params.schedule} (${cronToHuman(params.schedule!)})`;

  return `✓ Reminder set: "${params.title}" ${when} [${chResult.channel}] (id: ${id})`;
}

// ── Update ──────────────────────────────────────────────────────

export async function handleReminderUpdate(
  params: ReminderParams,
  deps: ReminderActionDeps,
): Promise<string> {
  const { state, statePath, writeState } = deps;

  if (!params.id) return 'Error: id is required.';

  const reminder = (state.reminders ?? []).find((r) => r.id === params.id);
  if (!reminder) return `Error: reminder "${params.id}" not found.`;

  if (params.title) reminder.title = params.title;
  if (params.notes !== undefined) reminder.notes = params.notes || undefined;
  if (params.channel) {
    const chResult = validateChannel(params.channel);
    if (!chResult.ok) return chResult.error;
    reminder.channel = chResult.channel;
  }

  if (params.recover_if_missed !== undefined) {
    reminder.recoverIfMissed = params.recover_if_missed;
  }

  if (params.fire_at) {
    const d = new Date(params.fire_at);
    if (isNaN(d.getTime())) return `Error: invalid fire_at "${params.fire_at}".`;
    reminder.fireAt = d.toISOString(); // Normalize to ISO UTC
  }

  if (params.schedule) {
    const err = validateCron(params.schedule);
    if (err) return `Error: invalid cron expression — ${err}`;
    reminder.schedule = params.schedule;
  }

  await writeState(statePath, state);
  info('reminder:update', { id: params.id });

  return `✓ Updated reminder "${reminder.title}" (${params.id})`;
}

// ── Remove ──────────────────────────────────────────────────────

export async function handleReminderRemove(
  params: ReminderParams,
  deps: ReminderActionDeps,
): Promise<string> {
  const { state, statePath, writeState } = deps;

  if (!params.id) return 'Error: id is required.';

  const idx = (state.reminders ?? []).findIndex((r) => r.id === params.id);
  if (idx === -1) return `Error: reminder "${params.id}" not found.`;

  const removed = state.reminders.splice(idx, 1)[0];
  await writeState(statePath, state);
  info('reminder:remove', { id: params.id, title: removed.title });

  return `✓ Removed reminder "${removed.title}" (${params.id})`;
}

// ── Snooze ──────────────────────────────────────────────────────

export async function handleReminderSnooze(
  params: ReminderParams,
  deps: ReminderActionDeps,
): Promise<string> {
  const { state, statePath, writeState } = deps;

  if (!params.id) return 'Error: id is required.';
  const minutes = params.snooze_minutes ?? 15;

  const idx = (state.reminders ?? []).findIndex((r) => r.id === params.id);
  if (idx === -1) return `Error: reminder "${params.id}" not found.`;

  state.reminders[idx] = snoozeReminder(state.reminders[idx], minutes);
  await writeState(statePath, state);
  info('reminder:snooze', { id: params.id, minutes });

  const until = state.reminders[idx].snoozedUntil;
  return `✓ Snoozed "${state.reminders[idx].title}" until ${until}`;
}

// ── Complete / Dismiss ──────────────────────────────────────────

export async function handleReminderComplete(
  params: ReminderParams,
  deps: ReminderActionDeps,
): Promise<string> {
  const { state, statePath, writeState } = deps;

  if (!params.id) return 'Error: id is required.';

  const reminder = (state.reminders ?? []).find((r) => r.id === params.id);
  if (!reminder) return `Error: reminder "${params.id}" not found.`;

  reminder.status = 'completed';
  reminder.completedAt = new Date().toISOString();
  reminder.snoozedUntil = undefined;

  // Trim completed reminders
  pruneCompleted(state);
  await writeState(statePath, state);
  info('reminder:complete', { id: params.id });

  return `✓ Completed "${reminder.title}" (${params.id})`;
}

// ── Enable / Disable ────────────────────────────────────────────

export async function handleReminderToggle(
  params: ReminderParams,
  deps: ReminderActionDeps,
  disable: boolean,
): Promise<string> {
  const { state, statePath, writeState } = deps;

  if (!params.id) return 'Error: id is required.';

  const reminder = (state.reminders ?? []).find((r) => r.id === params.id);
  if (!reminder) return `Error: reminder "${params.id}" not found.`;

  reminder.status = disable ? 'disabled' : 'active';
  if (!disable) reminder.snoozedUntil = undefined;

  await writeState(statePath, state);
  info('reminder:toggle', { id: params.id, disabled: disable });

  return `✓ ${disable ? 'Disabled' : 'Enabled'} "${reminder.title}" (${params.id})`;
}

// ── Helpers ─────────────────────────────────────────────────────

function validateChannel(ch?: string): { ok: true; channel: 'notification' | 'email' } | { ok: false; error: string } {
  if (ch === 'email') return { ok: false, error: 'Error: email channel is not yet supported. Use "notification" (desktop) instead.' };
  return { ok: true, channel: 'notification' };
}

function pruneCompleted(state: CronState): void {
  const completed = (state.reminders ?? []).filter(
    (r) => r.status === 'completed',
  );
  if (completed.length > MAX_COMPLETED_REMINDERS) {
    // Sort by completedAt desc, keep newest
    completed.sort(
      (a, b) =>
        new Date(b.completedAt ?? 0).getTime() -
        new Date(a.completedAt ?? 0).getTime(),
    );
    const toRemove = new Set(
      completed.slice(MAX_COMPLETED_REMINDERS).map((r) => r.id),
    );
    state.reminders = state.reminders.filter((r) => !toRemove.has(r.id));
  }
}
