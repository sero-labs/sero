/**
 * Shared globalThis EventEmitter singleton for the user-feedback IPC bridge.
 *
 * Both the Pi extension (ipc-bridge.ts) and the Electron IPC handler
 * (user-feedback-questions.ts) import from here to guarantee they share
 * the same emitter key and initialization logic.
 */

import { EventEmitter } from 'node:events';

const EMITTER_KEY = '__seroUserFeedbackBus';

export function getUserFeedbackBus(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!g[EMITTER_KEY]) {
    g[EMITTER_KEY] = new EventEmitter();
    (g[EMITTER_KEY] as EventEmitter).setMaxListeners(50);
  }
  return g[EMITTER_KEY] as EventEmitter;
}
