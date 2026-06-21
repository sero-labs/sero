/**
 * Turn-completion event bus for background app runtimes (Orchestrator
 * active-session steps). The agent subscription emits one completion per turn,
 * keyed by sessionId, so a background runtime can observe turn completion it
 * did not start in-process.
 */

import { EventEmitter } from 'node:events';
import type { AppRuntimeTurnResult } from '@sero-ai/common';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function key(sessionId: string): string {
  return `complete:${sessionId}`;
}

export function emitTurnComplete(sessionId: string, result: AppRuntimeTurnResult): void {
  emitter.emit(key(sessionId), result);
}

export function onCliTurnComplete(
  sessionId: string,
  cb: (result: AppRuntimeTurnResult) => void,
): () => void {
  const event = key(sessionId);
  emitter.on(event, cb);
  return () => emitter.off(event, cb);
}
