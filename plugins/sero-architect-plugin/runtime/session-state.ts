/**
 * The two facts every derived activity needs about this process: when it
 * started, and whether the Architect runtime is running in it.
 *
 * Both are process state, so they live here rather than being threaded through
 * every call. `SESSION_STARTED_AT` anchors `isLive`: a report stamped before it
 * belongs to an earlier session and cannot prove anything is running now.
 */

const SESSION_STARTED_AT = new Date().toISOString();

let running = false;

/** Called at extension activation, with `false` when the kill switch is off. */
export function markRuntimeRunning(value: boolean): void {
  running = value;
}

export function isRuntimeRunning(): boolean {
  return running;
}

export function activityOptions(): { sessionStartedAt: string; runtimeRunning: boolean } {
  return { sessionStartedAt: SESSION_STARTED_AT, runtimeRunning: running };
}

export { SESSION_STARTED_AT };
