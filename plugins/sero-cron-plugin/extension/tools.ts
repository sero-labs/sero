import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from 'typebox';

import type { ActionParams } from './actions';
import type { CronRuntime } from './runtime';
import type { ReminderParams } from './reminder-actions';

const CronParams = Type.Object({
  action: StringEnum([
    'list',
    'add',
    'update',
    'remove',
    'enable',
    'disable',
    'run',
  ] as const),
  name: Type.Optional(
    Type.String({ description: 'Job name (required for all except list)' }),
  ),
  schedule: Type.Optional(
    Type.String({
      description:
        'Cron expression: "min hour dom month dow". Example: "0 9 * * 1-5" = weekdays at 9am',
    }),
  ),
  prompt: Type.Optional(
    Type.String({
      description: 'Prompt to send to the agent when the job fires',
    }),
  ),
  channel: Type.Optional(
    Type.String({ description: 'Channel tag for grouping (default: "cron")' }),
  ),
  model: Type.Optional(
    Type.String({ description: 'Model pattern or ID. Omit for default.' }),
  ),
  run_if_missed: Type.Optional(
    Type.Boolean({
      description:
        'If true, run this job once on startup if it was missed since midnight today. Default: false.',
    }),
  ),
});

const ReminderParamsSchema = Type.Object({
  action: StringEnum([
    'list',
    'add',
    'update',
    'remove',
    'snooze',
    'complete',
    'enable',
    'disable',
  ] as const),
  id: Type.Optional(
    Type.String({ description: 'Reminder ID (required for all except list/add)' }),
  ),
  title: Type.Optional(
    Type.String({ description: 'Reminder title (required for add)' }),
  ),
  notes: Type.Optional(Type.String({ description: 'Optional notes or details' })),
  channel: Type.Optional(
    Type.String({
      description: 'Delivery channel. Only "notification" (desktop) is currently supported.',
    }),
  ),
  type: Type.Optional(Type.String({ description: '"once" (default) or "recurring"' })),
  fire_at: Type.Optional(
    Type.String({
      description:
        'ISO datetime for one-time reminders. IMPORTANT: call current_time first to get the accurate current time.',
    }),
  ),
  schedule: Type.Optional(
    Type.String({ description: 'Cron expression for recurring reminders' }),
  ),
  snooze_minutes: Type.Optional(
    Type.Number({
      description: 'Snooze duration in minutes (default: 15). -1 for tomorrow 9am.',
    }),
  ),
  recover_if_missed: Type.Optional(
    Type.Boolean({
      description:
        'If true, show a notification on startup for reminders missed while Sero was closed. Default: false.',
    }),
  ),
});

export function registerCronCommand(
  pi: ExtensionAPI,
  runtime: CronRuntime,
): void {
  pi.registerCommand('cron', {
    description: 'Toggle scheduler: /cron on | /cron off | /cron status',
    handler: async (args, ctx) => runtime.handleCronCommand(args, ctx),
  });
}

export function registerCurrentTimeTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'current_time',
    label: 'Current Time',
    description:
      'Get the current date and time. Call this BEFORE creating reminders with relative times.',
    parameters: Type.Object({}),
    async execute() {
      const now = new Date();
      const iso = now.toISOString();
      const local = now.toLocaleString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
      const offset = -now.getTimezoneOffset();
      const offsetStr = `UTC${offset >= 0 ? '+' : ''}${Math.floor(offset / 60)}:${String(
        Math.abs(offset) % 60,
      ).padStart(2, '0')}`;
      return {
        content: [
          {
            type: 'text' as const,
            text: `Current time: ${iso}\nLocal: ${local}\nTimezone: ${offsetStr}\nUnix: ${now.getTime()}`,
          },
        ],
        details: {},
      };
    },
    renderCall(_args, theme) {
      return new Text(
        theme.fg('toolTitle', theme.bold('current_time')),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const message = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(
        theme.fg(
          'muted',
          `🕐 ${message.split('\n')[0]?.replace('Current time: ', '') ?? ''}`,
        ),
        0,
        0,
      );
    },
  });
}

export function registerCronTool(pi: ExtensionAPI, runtime: CronRuntime): void {
  pi.registerTool({
    name: 'cron',
    label: 'Cron',
    description:
      'Manage scheduled cron jobs. Actions: list, add, update, remove, enable, disable, run.',
    parameters: CronParams,
    async execute(_toolCallId, params: ActionParams, _signal, _onUpdate, ctx) {
      const runtimeContext = ctx?.cwd ? { cwd: ctx.cwd } : undefined;
      return runtime.executeCronTool(params, runtimeContext);
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('cron '));
      text += theme.fg('muted', args.action);
      if (args.name) {
        text += ` ${theme.fg('accent', args.name)}`;
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, _options, theme) {
      const message = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return new Text(
        message.startsWith('Error:')
          ? theme.fg('error', message)
          : theme.fg('success', '✓ ') + theme.fg('muted', message),
        0,
        0,
      );
    },
  });
}

export function registerReminderTool(
  pi: ExtensionAPI,
  runtime: CronRuntime,
): void {
  pi.registerTool({
    name: 'reminder',
    label: 'Reminder',
    description:
      'Manage reminders with desktop notifications. Actions: list, add, update, remove, snooze, complete, enable, disable. ' +
      'IMPORTANT: For relative times, call current_time first to get accurate time, then compute fire_at. Email delivery is not supported yet.',
    parameters: ReminderParamsSchema,
    async execute(_toolCallId, params: ReminderParams, _signal, _onUpdate, ctx) {
      const runtimeContext = ctx?.cwd ? { cwd: ctx.cwd } : undefined;
      return runtime.executeReminderTool(params, runtimeContext);
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('reminder '));
      text += theme.fg('muted', args.action);
      if (args.title) {
        text += ` ${theme.fg('dim', `"${args.title}"`)}`;
      }
      if (args.id) {
        text += ` ${theme.fg('accent', args.id)}`;
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, _options, theme) {
      const message = result.content[0]?.type === 'text' ? result.content[0].text : '';
      if (message.startsWith('Error:')) {
        return new Text(theme.fg('error', message), 0, 0);
      }
      if (message.startsWith('✓')) {
        return new Text(
          theme.fg('success', '✓ ') + theme.fg('muted', message.slice(2)),
          0,
          0,
        );
      }
      return new Text(theme.fg('muted', message), 0, 0);
    },
  });
}
