import { expectError, expectOk, expectText } from '../expect';
import type { StepContext, ToolProbe } from '../types';
import { cronState, expectContains, expectLacks, must } from './cron-memory-support';

const TITLE = 'tc-reminder one';
const RENAMED = 'tc-reminder renamed';
const FIRE_AT = '2099-01-01T09:00:00Z';
const FIRE_AT_ISO = '2099-01-01T09:00:00.000Z';
const MOVED_AT = '2099-02-02T10:30:00Z';
const MOVED_AT_ISO = '2099-02-02T10:30:00.000Z';

function idOf(ctx: StepContext): string {
  return String(ctx.state.reminderId);
}

async function requireReminder(ctx: StepContext) {
  const reminder = (await cronState(ctx)).reminders.find((entry) => entry.id === idOf(ctx));
  must(reminder, `reminder ${idOf(ctx)} is not in the cron state file`);
  return reminder;
}

export const reminderProbe: ToolProbe = {
  tool: 'reminder',
  steps: [
    {
      action: 'add',
      params: { action: 'add', title: TITLE, notes: 'tc notes', type: 'once', fire_at: FIRE_AT },
      async expect(result, ctx) {
        // reminder-actions.ts: `✓ Reminder set: "${title}" at ${fire_at} [notification] (id: ${id})`
        expectText(result, `✓ Reminder set: "${TITLE}" at ${FIRE_AT_ISO} [notification] (id: `);
        const id = /\(id: ([a-z0-9]{8})\)/.exec(result.text)?.[1];
        must(id, `no reminder id in: ${result.text}`);
        ctx.state.reminderId = id;
        const reminder = await requireReminder(ctx);
        must(reminder.title === TITLE && reminder.notes === 'tc notes' && reminder.type === 'once', `reminder saved wrongly: ${JSON.stringify(reminder)}`);
        must(reminder.fireAt === FIRE_AT_ISO && reminder.status === 'active' && reminder.channel === 'notification', `reminder saved wrongly: ${JSON.stringify(reminder)}`);
      },
    },
    {
      // The email channel is refused, and nothing is saved.
      action: 'add',
      params: { action: 'add', title: 'tc-reminder email', type: 'once', fire_at: FIRE_AT, channel: 'email' },
      async expect(result, ctx) {
        expectError(result, 'email channel is not yet supported');
        must(!(await cronState(ctx)).reminders.some((entry) => entry.title === 'tc-reminder email'), 'the refused reminder was saved');
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, 'Active Reminders (', `**${TITLE}** (${idOf(ctx)})`, '🔔 Active'),
    },
    {
      action: 'update',
      params: (ctx) => ({ action: 'update', id: idOf(ctx), title: RENAMED, notes: 'tc notes changed', fire_at: MOVED_AT }),
      async expect(result, ctx) {
        expectText(result, `✓ Updated reminder "${TITLE}" (${idOf(ctx)})`);
        const reminder = await requireReminder(ctx);
        must(reminder.title === RENAMED && reminder.notes === 'tc notes changed' && reminder.fireAt === MOVED_AT_ISO, `reminder not updated: ${JSON.stringify(reminder)}`);
      },
    },
    {
      action: 'snooze',
      params: (ctx) => ({ action: 'snooze', id: idOf(ctx), snooze_minutes: 30 }),
      async expect(result, ctx) {
        expectText(result, `✓ Snoozed "${RENAMED}" until `);
        const reminder = await requireReminder(ctx);
        must(reminder.status === 'snoozed' && reminder.snoozedUntil, `reminder not snoozed: ${JSON.stringify(reminder)}`);
        const minutesAhead = (Date.parse(reminder.snoozedUntil) - Date.now()) / 60_000;
        must(minutesAhead > 28 && minutesAhead < 31, `snoozed for ${minutesAhead} minutes, expected about 30`);
        expectText(result, reminder.snoozedUntil);
      },
    },
    {
      action: 'disable',
      params: (ctx) => ({ action: 'disable', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `✓ Disabled "${RENAMED}" (${idOf(ctx)})`);
        const reminder = await requireReminder(ctx);
        must(reminder.status === 'disabled' && !reminder.snoozedUntil, `reminder not disabled: ${JSON.stringify(reminder)}`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, 'Disabled (', `- ${RENAMED} (${idOf(ctx)})`),
    },
    {
      action: 'enable',
      params: (ctx) => ({ action: 'enable', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `✓ Enabled "${RENAMED}" (${idOf(ctx)})`);
        must((await requireReminder(ctx)).status === 'active', 'the reminder is not active again');
      },
    },
    {
      action: 'complete',
      params: (ctx) => ({ action: 'complete', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `✓ Completed "${RENAMED}" (${idOf(ctx)})`);
        const reminder = await requireReminder(ctx);
        must(reminder.status === 'completed' && reminder.completedAt, `reminder not completed: ${JSON.stringify(reminder)}`);
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => expectContains(result, 'Completed (', `- ${RENAMED} (${idOf(ctx)})`),
    },
    {
      action: 'remove',
      params: { action: 'remove', id: 'tc-missing' },
      expect: (result) => expectError(result, 'Error: reminder "tc-missing" not found.'),
    },
    {
      action: 'remove',
      params: (ctx) => ({ action: 'remove', id: idOf(ctx) }),
      async expect(result, ctx) {
        expectText(result, `✓ Removed reminder "${RENAMED}" (${idOf(ctx)})`);
        must(!(await cronState(ctx)).reminders.some((entry) => entry.id === idOf(ctx)), 'the reminder is still in the cron state file');
      },
    },
    {
      action: 'list',
      params: { action: 'list' },
      expect: (result, ctx) => { expectOk(result); expectLacks(result, idOf(ctx)); },
    },
  ],
};
