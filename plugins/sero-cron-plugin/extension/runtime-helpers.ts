import type { NotificationSettings } from '../shared/types';

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
