import type {
  AppRuntimeReleaseWorktreeRequest,
  AppRuntimeReleaseWorktreeResult,
} from '@sero-ai/common';

import { branchWorkSinceBase, checkoutCleanliness } from './checkout';
import {
  defaultWorktreeProcessGuard,
  type WorktreeProcessGuard,
} from './process-guard';
import { removeReleasedSlot } from './release-remove';
import {
  recycleReleasedSlot,
  type RecycleFaultPoint,
} from './release-recycle';
import type { PullRequestEvidenceProvider } from './disposability';
import type { RepositoryIdentity } from './repository';
import { commitPoolMutation, openPool } from './session';
import { findSlot, replaceSlot } from './state-store';
import { recordRelease, type PoolSlot, type PoolState, type SlotState } from './types';

export interface ReleaseWorktreeDependencies {
  processGuard?: WorktreeProcessGuard;
  pullRequests?: PullRequestEvidenceProvider;
  retainedIdleCapacity?: number;
  fault?: (point: RecycleFaultPoint) => Promise<void> | void;
}

function result(
  status: AppRuntimeReleaseWorktreeResult['status'],
  slotId: string,
  reason: string,
  checkout: AppRuntimeReleaseWorktreeResult['checkout'],
): AppRuntimeReleaseWorktreeResult {
  return { status, slotId, reason, checkout };
}

function recordedCheckout(status: 'released' | 'preserved'): AppRuntimeReleaseWorktreeResult['checkout'] {
  return status === 'released' ? 'removed' : 'retained';
}

function answerMissingSlot(
  state: PoolState,
  request: AppRuntimeReleaseWorktreeRequest,
): AppRuntimeReleaseWorktreeResult {
  const known = state.released.find((entry) =>
    entry.slotId === request.slotId && entry.leaseId === request.expectedLeaseId,
  );
  if (known) {
    return result(
      'already-released',
      request.slotId,
      `This lease was already released: ${known.reason}`,
      recordedCheckout(known.status),
    );
  }
  return result(
    'stale-lease',
    request.slotId,
    `Slot ${request.slotId} holds no lease ${request.expectedLeaseId}, and no release of it is on record.`,
    'unknown',
  );
}

interface RemovalClassification {
  state: SlotState;
  reason: string;
  removable: boolean;
}

async function classifyRemoval(slot: PoolSlot): Promise<RemovalClassification> {
  const cleanliness = await checkoutCleanliness(slot.path);
  if (cleanliness.status === 'unknown') {
    return {
      state: 'recovery-required',
      reason: `The checkout's status could not be read: ${cleanliness.reason}`,
      removable: false,
    };
  }
  if (cleanliness.status === 'dirty') {
    return {
      state: 'dirty',
      reason: `The checkout has uncommitted work: ${cleanliness.detail}`,
      removable: false,
    };
  }
  if (slot.lease?.branchKind === 'external-pr') {
    return {
      state: 'available',
      reason: 'Explicit removal may remove this checkout, but never its external pull-request branch.',
      removable: true,
    };
  }
  const work = await branchWorkSinceBase(slot.path, slot.lease?.baseCommit ?? null);
  if (work.status === 'unknown') {
    return {
      state: 'recovery-required',
      reason: `The branch could not be compared with its base: ${work.reason}`,
      removable: false,
    };
  }
  return {
    state: work.status === 'has-work' ? 'unmerged' : 'available',
    reason: work.status === 'has-work'
      ? `Explicit removal may remove the checkout holding ${work.commits} local commit(s); its branch is retained unless separately authorised.`
      : 'The checkout is clean and its branch added nothing to the acquisition base.',
    removable: true,
  };
}

function preserveSlot(
  state: PoolState,
  slot: PoolSlot,
  reason: string,
  disposition: AppRuntimeReleaseWorktreeRequest['disposition'],
): PoolState {
  if (!slot.lease) return state;
  const now = new Date().toISOString();
  const ownedReason = `Kept for "${slot.lease.leaseHolder}": ${reason}`;
  const record = {
    slotId: slot.slotId,
    leaseId: slot.lease.leaseId,
    disposition,
    status: 'preserved' as const,
    at: now,
    reason: ownedReason,
  };
  return recordRelease(replaceSlot(state, {
    ...slot,
    state: 'leased',
    operation: null,
    lastReleased: record,
    reason: ownedReason,
    updatedAt: now,
  }), record);
}

async function commitPreserved(
  identity: RepositoryIdentity,
  slot: PoolSlot,
  request: AppRuntimeReleaseWorktreeRequest,
  classification: RemovalClassification,
): Promise<AppRuntimeReleaseWorktreeResult> {
  const committed = await commitPoolMutation(identity, (state) => {
    const current = findSlot(state, request.slotId);
    if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: 'stale' as const };
    return {
      state: preserveSlot(state, current, classification.reason, request.disposition),
      value: 'preserved' as const,
    };
  });
  if (committed.status !== 'ok') return result('recovery-required', slot.slotId, committed.reason, 'retained');
  if (committed.value === 'stale') return result('stale-lease', slot.slotId, 'The slot changed before preservation.', 'unknown');
  return result(
    classification.state === 'recovery-required' ? 'recovery-required' : 'preserved',
    slot.slotId,
    classification.reason,
    'retained',
  );
}

export async function releaseWorktree(
  workspacePath: string,
  request: AppRuntimeReleaseWorktreeRequest,
  dependencies: ReleaseWorktreeDependencies = {},
): Promise<AppRuntimeReleaseWorktreeResult> {
  const opened = await openPool(workspacePath);
  if (opened.status !== 'ok') return result('recovery-required', request.slotId, opened.reason, 'retained');
  const { identity } = opened.session;

  const slot = findSlot(opened.session.state, request.slotId);
  if (!slot) return answerMissingSlot(opened.session.state, request);
  if (!slot.lease) {
    const known = opened.session.state.released.find((entry) =>
      entry.slotId === request.slotId && entry.leaseId === request.expectedLeaseId,
    );
    if (known) {
      return result(
        'already-released',
        slot.slotId,
        `This lease was already released: ${known.reason}`,
        recordedCheckout(known.status),
      );
    }
    return result('recovery-required', slot.slotId, `Slot ${slot.slotId} holds no lease: ${slot.reason}`, 'retained');
  }
  if (slot.lease.leaseId !== request.expectedLeaseId) {
    return result(
      'stale-lease',
      slot.slotId,
      `Slot ${slot.slotId} now holds lease ${slot.lease.leaseId}, so an older release cannot act on it.`,
      'unknown',
    );
  }
  if (slot.state !== 'leased') {
    return result('recovery-required', slot.slotId, `Slot ${slot.slotId} is ${slot.state}: ${slot.reason}`, 'retained');
  }
  if (slot.lastReleased?.leaseId === request.expectedLeaseId
    && slot.lastReleased.disposition === request.disposition) {
    return result(
      'already-released',
      slot.slotId,
      slot.lastReleased.reason,
      recordedCheckout(slot.lastReleased.status),
    );
  }

  if (request.disposition === 'preserve') {
    return commitPreserved(identity, slot, request, {
      state: 'leased',
      reason: 'The caller requested that this exact lease and checkout be preserved.',
      removable: false,
    });
  }

  const guard = dependencies.processGuard ?? defaultWorktreeProcessGuard;
  if (request.disposition === 'recycle') {
    return recycleReleasedSlot(opened.session.workspacePath, identity, slot, request, {
      processGuard: guard,
      pullRequests: dependencies.pullRequests,
      retainedIdleCapacity: dependencies.retainedIdleCapacity,
      fault: dependencies.fault,
      removeWhenFull: () => removeReleasedSlot(opened.session.workspacePath, identity, slot, request, guard),
    });
  }

  const classification = await classifyRemoval(slot);
  if (!classification.removable) return commitPreserved(identity, slot, request, classification);
  return removeReleasedSlot(opened.session.workspacePath, identity, slot, request, guard);
}
