import { describe, expect, it } from 'vitest';
import { migrateLegacyRunDisposition } from '../run-disposition';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { LoopRun } from '../../shared/types';

function waitingRun(): LoopRun {
  return {
    id: 'run-1',
    runNumber: 1,
    status: 'waiting',
    startedStepIds: [],
    stepAttempts: [],
    recoveryDecisions: [],
    observations: [],
    startedAt: '2026-07-14T08:00:00.000Z',
    endedAt: '2026-07-14T08:00:10.000Z',
  };
}

describe('legacy run disposition migration', () => {
  it('turns the latest dirty-workspace defer into an explicit skipped run', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runs = [waitingRun()];
    loop.runtime.workspace.deferredReason = 'User deferred the workflow on a dirty workspace root.';

    const migrated = migrateLegacyRunDisposition(loop);

    expect(migrated.runs[0]).toMatchObject({
      status: 'skipped',
      statusReason: 'User skipped the run because the workspace has uncommitted changes.',
    });
    expect(migrated.runtime.workspace.deferredReason).toBeUndefined();
  });

  it('preserves the retry time when migrating a snoozed run', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runs = [waitingRun()];
    loop.runtime.snoozedUntil = '2026-07-14T09:00:00.000Z';
    loop.runtime.workspace.deferredReason = 'Snoozed until 2026-07-14T09:00:00.000Z.';

    const migrated = migrateLegacyRunDisposition(loop);

    expect(migrated.runs[0]).toMatchObject({ status: 'snoozed', retryAt: '2026-07-14T09:00:00.000Z' });
  });

  it('does not relabel a run that started steps', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.runs = [{ ...waitingRun(), startedStepIds: ['step-1'] }];
    loop.runtime.workspace.deferredReason = 'User deferred the workflow on a dirty workspace root.';

    expect(migrateLegacyRunDisposition(loop)).toBe(loop);
  });
});
