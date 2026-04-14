/**
 * Local wrapper for the shared user-feedback EventEmitter singleton.
 *
 * The singleton key itself is now owned by `@sero/common`; this wrapper keeps
 * Electron main/preload code on a stable local module without importing plugin
 * package code into the host boundary.
 */

import { EventEmitter } from 'events';
import { USER_FEEDBACK_BUS_KEY } from '@sero/common';

export function getUserFeedbackBus(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!g[USER_FEEDBACK_BUS_KEY]) {
    g[USER_FEEDBACK_BUS_KEY] = new EventEmitter();
    (g[USER_FEEDBACK_BUS_KEY] as EventEmitter).setMaxListeners(50);
  }
  return g[USER_FEEDBACK_BUS_KEY] as EventEmitter;
}
