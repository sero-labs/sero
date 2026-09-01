import type { AppRuntimeReleaseWorktreeRequest, AppRuntimeReleaseWorktreeResult } from '@sero-ai/common';

import { execWorktreeGit } from '../exec';
import { resolveCommit } from '../provision';
import { resolvePreferredBaseRef } from '../workspace-sync';
import { checkoutCleanliness } from './checkout';
import {
  classifyDisposability,
  githubPullRequestEvidence,
  type PullRequestEvidenceProvider,
} from './disposability';
import type { WorktreeProcessGuard } from './process-guard';
import { resetCheckout } from './reset';
import type { RepositoryIdentity } from './repository';
import { commitPoolMutation } from './session';
import { findSlot, replaceSlot } from './state-store';
import { recordRelease, type PoolSlot } from './types';

export const DEFAULT_RETAINED_IDLE_CAPACITY = 2;

export type RecycleFaultPoint =
  | 'after-reservation'
  | 'after-owned-shutdown'
  | 'after-reset'
  | 'before-final-commit';

export interface RecycleDependencies {
  processGuard: WorktreeProcessGuard;
  pullRequests?: PullRequestEvidenceProvider;
  retainedIdleCapacity?: number;
  fault?: (point: RecycleFaultPoint) => Promise<void> | void;
  removeWhenFull(): Promise<AppRuntimeReleaseWorktreeResult>;
}

function result(
  status: AppRuntimeReleaseWorktreeResult['status'],
  slotId: string,
  reason: string,
  checkout: AppRuntimeReleaseWorktreeResult['checkout'],
): AppRuntimeReleaseWorktreeResult {
  return { status, slotId, reason, checkout };
}

async function failTransition(
  identity: RepositoryIdentity,
  slotId: string,
  leaseId: string,
  reason: string,
): Promise<void> {
  await commitPoolMutation(identity, (state) => {
    const current = findSlot(state, slotId);
    if (!current || current.lease?.leaseId !== leaseId) return { value: null };
    return {
      state: replaceSlot(state, {
        ...current,
        state: 'recovery-required',
        operation: null,
        reason,
        updatedAt: new Date().toISOString(),
      }),
      value: null,
    };
  }).catch(() => undefined);
}

async function preserveLease(
  identity: RepositoryIdentity,
  slot: PoolSlot,
  request: AppRuntimeReleaseWorktreeRequest,
  reason: string,
  recoveryRequired: boolean,
): Promise<AppRuntimeReleaseWorktreeResult> {
  const now = new Date().toISOString();
  const ownedReason = slot.lease
    ? `Kept for "${slot.lease.leaseHolder}": ${reason}`
    : reason;
  const committed = await commitPoolMutation<'preserved' | 'stale'>(identity, (state) => {
    const current = findSlot(state, slot.slotId);
    if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: 'stale' };
    const record = {
      slotId: slot.slotId,
      leaseId: request.expectedLeaseId,
      disposition: request.disposition,
      status: 'preserved' as const,
      at: now,
      reason: ownedReason,
    };
    return {
      state: recordRelease(replaceSlot(state, {
        ...current,
        state: 'leased',
        operation: null,
        lastReleased: record,
        reason: ownedReason,
        updatedAt: now,
      }), record),
      value: 'preserved',
    };
  });
  if (committed.status !== 'ok') return result('recovery-required', slot.slotId, committed.reason, 'retained');
  if (committed.value === 'stale') return result('stale-lease', slot.slotId, 'The slot changed before preservation.', 'unknown');
  return result(recoveryRequired ? 'recovery-required' : 'preserved', slot.slotId, ownedReason, 'retained');
}

export async function recycleReleasedSlot(
  workspacePath: string,
  identity: RepositoryIdentity,
  slot: PoolSlot,
  request: AppRuntimeReleaseWorktreeRequest,
  dependencies: RecycleDependencies,
): Promise<AppRuntimeReleaseWorktreeResult> {
  const cleanliness = await checkoutCleanliness(slot.path);
  if (cleanliness.status !== 'clean') {
    const reason = cleanliness.status === 'dirty'
      ? `The checkout has tracked changes or non-ignored untracked files: ${cleanliness.detail}`
      : `The checkout cleanliness could not be verified: ${cleanliness.reason}`;
    return preserveLease(identity, slot, request, reason, cleanliness.status === 'unknown');
  }
  let baseRef: string | null;
  let targetCommit: string | null;
  try {
    baseRef = await resolvePreferredBaseRef(workspacePath);
    targetCommit = await resolveCommit(workspacePath, baseRef ?? 'HEAD');
  } catch (error) {
    return preserveLease(
      identity,
      slot,
      request,
      `The exact reset target could not be resolved: ${String(error)}`,
      true,
    );
  }
  if (!targetCommit) {
    return preserveLease(
      identity,
      slot,
      request,
      'The exact reset target could not be resolved.',
      true,
    );
  }

  const disposal = await classifyDisposability(
    workspacePath,
    slot,
    targetCommit,
    dependencies.pullRequests ?? githubPullRequestEvidence,
  );
  if (disposal.status !== 'disposable') {
    return preserveLease(identity, slot, request, disposal.reason, disposal.status === 'unverifiable');
  }

  const capacity = dependencies.retainedIdleCapacity ?? DEFAULT_RETAINED_IDLE_CAPACITY;
  const reserved = await commitPoolMutation(identity, (state) => {
    const current = findSlot(state, slot.slotId);
    if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: 'stale' as const };
    const retained = state.slots.filter((candidate) =>
      candidate.state === 'available'
      || (candidate.state === 'recycling' && candidate.operation?.intendedState === 'available'),
    ).length;
    if (retained >= capacity) return { value: 'remove' as const };
    const now = new Date().toISOString();
    return {
      state: replaceSlot(state, {
        ...current,
        state: 'recycling',
        operation: {
          operationId: request.expectedLeaseId,
          pid: process.pid,
          startedAt: now,
          intendedState: 'available',
          leaseId: request.expectedLeaseId,
          resetTarget: { ref: baseRef ?? 'HEAD', commit: targetCommit },
        },
        reason: `The checkout is being reset to ${targetCommit}.`,
        updatedAt: now,
      }),
      value: 'recycle' as const,
    };
  });
  if (reserved.status !== 'ok') return result('recovery-required', slot.slotId, reserved.reason, 'retained');
  if (reserved.value === 'stale') return result('stale-lease', slot.slotId, 'The slot changed before reset.', 'unknown');
  if (reserved.value === 'remove') return dependencies.removeWhenFull();
  await dependencies.fault?.('after-reservation');

  const processes = await dependencies.processGuard.prepare(slot.path);
  if (processes.status !== 'safe') {
    return preserveLease(
      identity,
      slot,
      request,
      processes.reason,
      processes.status === 'unverifiable',
    );
  }
  await dependencies.fault?.('after-owned-shutdown');

  const reset = await resetCheckout(workspacePath, slot.path, targetCommit);
  if (reset.status !== 'reset') {
    const reason = `The cache-preserving reset failed: ${reset.reason}`;
    await failTransition(identity, slot.slotId, request.expectedLeaseId, reason);
    return result('recovery-required', slot.slotId, reason, 'retained');
  }
  await dependencies.fault?.('after-reset');

  if (slot.lease?.branchKind === 'fresh-task' && slot.branchName) {
    try {
      // The exact old tip is an atomic fence. A branch that moved after
      // classification is preserved instead of being deleted by name alone.
      await execWorktreeGit([
        'update-ref', '-d', `refs/heads/${slot.branchName}`, disposal.branchTip,
      ], { cwd: workspacePath, timeout: 10_000 });
    } catch (error) {
      const reason = `The checkout was reset, but its disposable branch could not be deleted with the proved tip fence: ${String(error)}`;
      await failTransition(identity, slot.slotId, request.expectedLeaseId, reason);
      return result('recovery-required', slot.slotId, reason, 'retained');
    }
  }

  const reason = `The checkout was reset to ${targetCommit} and retained as a reusable idle slot; ${reset.preservedIgnoredPaths} ignored path(s) were preserved.`;
  const now = new Date().toISOString();
  await dependencies.fault?.('before-final-commit');
  const committed = await commitPoolMutation<'committed' | 'stale'>(identity, (state) => {
    const current = findSlot(state, slot.slotId);
    if (!current || current.operation?.operationId !== request.expectedLeaseId
      || current.lease?.leaseId !== request.expectedLeaseId) {
      return { value: 'stale' };
    }
    const record = {
      slotId: slot.slotId,
      leaseId: request.expectedLeaseId,
      disposition: request.disposition,
      status: 'released' as const,
      at: now,
      reason,
    };
    return {
      state: recordRelease(replaceSlot(state, {
        ...current,
        state: 'available',
        lease: null,
        operation: null,
        branchName: null,
        branchKind: null,
        preparedHead: targetCommit,
        lastReleased: record,
        reason,
        updatedAt: now,
      }), record),
      value: 'committed',
    };
  });
  if (committed.status !== 'ok') return result('recovery-required', slot.slotId, committed.reason, 'unknown');
  if (committed.value === 'stale') return result('recovery-required', slot.slotId, 'The reset finished but its final state fence did not match.', 'unknown');
  // The old lease's checkout is gone even though its physical directory is warm.
  return result('released', slot.slotId, reason, 'removed');
}
