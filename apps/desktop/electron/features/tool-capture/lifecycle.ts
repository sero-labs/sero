import { sweepOrphanedCaptures, type SweepOptions, type SweepResult } from './retention';

/**
 * Capture lifecycle coordination.
 *
 * Fork publication, session deletion and the cleanup sweep run through one
 * queue, so a sweep can never interleave with a fork that is being written.
 * A committed fork's file is therefore always visible to the sweep that
 * follows a concurrent deletion.
 */
let retentionQueue: Promise<unknown> = Promise.resolve();

export function runRetentionExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = retentionQueue.then(operation);
  retentionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Publish a fork inside the retention gate.
 *
 * The fork copies the branch entries, including each tool result's capture
 * record, so its inherited references are durable before it becomes visible.
 */
export function publishSessionFork<T>(operation: () => Promise<T>): Promise<T> {
  return runRetentionExclusive(operation);
}

/**
 * Release a deleted session's capture references and remove every capture whose
 * last reference is gone. The session file must already be unlinked.
 */
export function releaseSessionReferences(options?: SweepOptions): Promise<SweepResult> {
  return runRetentionExclusive(() => sweepOrphanedCaptures(options));
}

/** Startup sweep. Never blocks startup and never throws. */
export function runStartupCaptureSweep(options?: SweepOptions): Promise<SweepResult> {
  return runRetentionExclusive(() => sweepOrphanedCaptures(options)).catch((error: unknown) => {
    console.warn('[tool-capture] Capture sweep could not complete:', error);
    return {
      deferred: true,
      reason: 'sweep failed',
      removedCaptures: [],
      removedRtkStates: [],
      removedForkReferences: [],
    } satisfies SweepResult;
  });
}
