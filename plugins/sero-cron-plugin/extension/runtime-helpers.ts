import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type { CronState, NotificationSettings } from '../shared/types';
import type { ActionParams } from './actions';
import type { ReminderParams } from './reminder-actions';
import { readState } from './state-io';

export function formatRuntimeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function toolError(text: string): {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
} {
  return {
    content: [{ type: 'text', text: text.startsWith('Error:') ? text : `Error: ${text}` }],
    details: {},
  };
}

export async function readNotificationSettingsOrWarn(
  statePath: string,
  warn: (event: string, details?: Record<string, unknown>) => void,
  context: 'job' | 'reminder',
): Promise<NotificationSettings | undefined> {
  try {
    const state = await readState(statePath);
    return state.notificationSettings ?? undefined;
  } catch (error) {
    warn(`scheduler:${context}-notify-state-read-failed`, {
      path: statePath,
      error: formatRuntimeError(error),
    });
    return undefined;
  }
}

export interface CronCommandContext {
  cwd?: string;
  ui?: {
    notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
  };
}

export interface CronToolContext {
  cwd: string;
}

export interface ToolTextResult {
  content: [{ type: 'text'; text: string }];
  details: Record<string, never>;
}

export interface CronRuntime {
  attachPi: (pi: ExtensionAPI) => void;
  handleSessionStart: (pi: ExtensionAPI, ctx: { cwd: string }) => Promise<void>;
  handleSessionSwitch: (ctx: { cwd: string }) => void;
  handleSessionShutdown: () => Promise<void>;
  handleCronCommand: (args?: string, ctx?: CronCommandContext) => Promise<void>;
  executeCronTool: (params: ActionParams, ctx?: CronToolContext) => Promise<ToolTextResult>;
  executeReminderTool: (
    params: ReminderParams,
    ctx?: CronToolContext,
  ) => Promise<ToolTextResult>;
}

export function textToolResult(text: string): ToolTextResult {
  return {
    content: [{ type: 'text', text }],
    details: {},
  };
}

export function getSchedulerStartOpts(
  state: CronState,
): { lastTickMinute?: string } | undefined {
  return state.lastTickMinute ? { lastTickMinute: state.lastTickMinute } : undefined;
}
