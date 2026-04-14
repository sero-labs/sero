/**
 * Shared globalThis EventEmitter singleton for the user-feedback IPC bridge.
 *
 * The bus key itself lives in `@sero/common` so the extension and Electron host
 * cannot drift on manual string copies.
 */

import { EventEmitter } from 'node:events';
import { USER_FEEDBACK_BUS_KEY } from '@sero/common';

export function getUserFeedbackBus(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!g[USER_FEEDBACK_BUS_KEY]) {
    g[USER_FEEDBACK_BUS_KEY] = new EventEmitter();
    (g[USER_FEEDBACK_BUS_KEY] as EventEmitter).setMaxListeners(50);
  }
  return g[USER_FEEDBACK_BUS_KEY] as EventEmitter;
}
