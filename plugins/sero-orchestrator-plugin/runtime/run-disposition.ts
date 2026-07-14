/** Backward compatibility for dirty-workspace skips written before runs had
 * explicit `skipped` / `snoozed` states. */

import type { Loop, LoopRun } from '../shared/types';

const LEGACY_SKIP_REASON = 'User deferred the workflow on a dirty workspace root.';

export function migrateLegacyRunDisposition(loop: Loop): Loop {
  const reason = loop.runtime.workspace.deferredReason;
  const last = loop.runs[loop.runs.length - 1];
  if (!reason || !isPreflightWaitingRun(last)) return loop;

  const snoozed = Boolean(loop.runtime.snoozedUntil) || reason.startsWith('Snoozed until ');
  const migratedRun: LoopRun = {
    ...last,
    status: snoozed ? 'snoozed' : 'skipped',
    statusReason: snoozed
      ? 'User snoozed the run because the workspace has uncommitted changes.'
      : reason === LEGACY_SKIP_REASON
        ? 'User skipped the run because the workspace has uncommitted changes.'
        : reason,
    retryAt: snoozed ? loop.runtime.snoozedUntil : undefined,
  };
  const { deferredReason: _, ...workspace } = loop.runtime.workspace;
  return {
    ...loop,
    runs: [...loop.runs.slice(0, -1), migratedRun],
    runtime: { ...loop.runtime, workspace },
  };
}

function isPreflightWaitingRun(run: LoopRun | undefined): run is LoopRun {
  return Boolean(
    run
      && run.status === 'waiting'
      && run.endedAt
      && run.startedStepIds.length === 0
      && run.stepAttempts.length === 0,
  );
}
