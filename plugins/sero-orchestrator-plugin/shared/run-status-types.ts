/** Persisted lifecycle state for one loop iteration. */
export type LoopRunStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'orphaned'
  | 'skipped'
  | 'snoozed';

/** Workspace preflight outcome that ends a run before any steps start. */
export interface DeferredRunResult {
  status: 'skipped' | 'snoozed';
  reason: string;
  retryAt?: string;
}
