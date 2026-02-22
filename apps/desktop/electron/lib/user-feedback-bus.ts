/**
 * Local wrapper for the shared user-feedback EventEmitter singleton.
 *
 * Mirrors packages/pi-user-feedback/shared/emitter.ts. The key MUST match.
 * This wrapper exists because the electron tsconfig's rootDir constraint
 * prevents importing directly from the packages/ directory.
 *
 * Source of truth: packages/pi-user-feedback/shared/emitter.ts
 */

import { EventEmitter } from 'events';

const EMITTER_KEY = '__seroUserFeedbackBus';

export function getUserFeedbackBus(): EventEmitter {
  const g = globalThis as Record<string, unknown>;
  if (!g[EMITTER_KEY]) {
    g[EMITTER_KEY] = new EventEmitter();
    (g[EMITTER_KEY] as EventEmitter).setMaxListeners(50);
  }
  return g[EMITTER_KEY] as EventEmitter;
}
