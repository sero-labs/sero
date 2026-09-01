/**
 * Release: conditional on the exact lease identity, and never authoritative
 * about disposal.
 *
 * Three outcomes are distinguished precisely, because they have different
 * consequences for work on disk:
 *
 *  - the first release of lease L1 acts;
 *  - a retry of L1 before reassignment answers `already-released` and changes
 *    nothing;
 *  - a delayed L1 arriving after the slot took lease L2 answers `stale-lease`
 *    and cannot touch L2's checkout.
 *
 * An identity older than the retained release history fails closed as stale.
 * The caller's disposition is intent only: the host re-classifies the checkout
 * and preserves it whenever removal cannot be proved safe.
 */

import type {
  AppRuntimeReleaseWorktreeRequest,
  AppRuntimeReleaseWorktreeResult,
} from '@sero-ai/common';

import { branchWorkSinceBase, checkoutCleanliness } from './checkout';
import { withGitMutationGate } from './locks';
import {
  deleteWorktreeBranch,
  pruneWorktreeRegistrations,
  removeRegisteredWorktree,
} from '../removal';
import type { RepositoryIdentity } from './repository';
import { commitPoolMutation, openPool } from './session';
import { dropSlot, findSlot, replaceSlot } from './state-store';
import { recordRelease, type PoolSlot, type PoolState, type SlotState } from './types';

function result(
  status: AppRuntimeReleaseWorktreeResult['status'],
  slotId: string,
  reason: string,
): AppRuntimeReleaseWorktreeResult {
  return { status, slotId, reason };
}

/** Answers a release whose slot is no longer in the pool. */
function answerMissingSlot(
  state: PoolState,
  request: AppRuntimeReleaseWorktreeRequest,
): AppRuntimeReleaseWorktreeResult {
  const known = state.released.find((entry) => entry.leaseId === request.expectedLeaseId);
  if (known) {
    return result('already-released', request.slotId, `This lease was already released: ${known.reason}`);
  }
  return result(
    'stale-lease',
    request.slotId,
    `Slot ${request.slotId} holds no lease ${request.expectedLeaseId}, and no release of it is on record.`,
  );
}

interface Classification {
  state: SlotState;
  reason: string;
  /** False when the checkout must be kept whatever the caller asked for. */
  removable: boolean;
}

/**
 * What this checkout is, and whether this disposition may dispose of it.
 *
 * Two conditions preserve it under every disposition, because neither can be
 * undone: work Git has not been told about, and a status Git could not report.
 * A `recycle` — the routine end-of-run return — additionally keeps a checkout
 * whose branch holds work the base does not, and an open pull request's
 * checkout. A `remove` is explicitly authorised disposal, so committed work no
 * longer blocks it; the branch itself still survives unless the caller also
 * asked for its deletion, and a pull-request branch is never deleted at all.
 */
async function classify(
  slot: PoolSlot,
  disposition: AppRuntimeReleaseWorktreeRequest['disposition'],
): Promise<Classification> {
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

  const external = slot.lease?.branchKind === 'external-pr';
  const work = external
    ? ({ status: 'no-work' } as const)
    : await branchWorkSinceBase(slot.path, slot.lease?.baseCommit ?? null);
  const removable = disposition === 'remove'
    || (!external && work.status === 'no-work');

  if (external) {
    return {
      state: removable ? 'available' : 'unmerged',
      reason: 'The checkout is on a pull request branch, whose branch Sero never deletes.',
      removable,
    };
  }
  if (work.status === 'has-work') {
    return {
      state: 'unmerged',
      reason: `The branch holds ${work.commits} commit(s) the base does not.`,
      removable,
    };
  }
  if (work.status === 'unknown') {
    return {
      state: 'recovery-required',
      reason: `The branch could not be compared with its base: ${work.reason}`,
      removable,
    };
  }
  return {
    state: 'available',
    reason: 'The checkout is clean and its branch added nothing to the base.',
    removable,
  };
}

function preserveSlot(state: PoolState, slot: PoolSlot, classification: Classification): PoolState {
  const now = new Date().toISOString();
  const withSlot = replaceSlot(state, {
    ...slot,
    state: classification.state,
    lease: null,
    operation: null,
    lastReleased: slot.lease
      ? { slotId: slot.slotId, leaseId: slot.lease.leaseId, status: 'preserved', at: now, reason: classification.reason }
      : slot.lastReleased,
    reason: classification.reason,
    updatedAt: now,
  });
  return slot.lease
    ? recordRelease(withSlot, {
      slotId: slot.slotId,
      leaseId: slot.lease.leaseId,
      status: 'preserved',
      at: now,
      reason: classification.reason,
    })
    : withSlot;
}

export async function releaseWorktree(
  workspacePath: string,
  request: AppRuntimeReleaseWorktreeRequest,
): Promise<AppRuntimeReleaseWorktreeResult> {
  const opened = await openPool(workspacePath);
  if (opened.status !== 'ok') return result('recovery-required', request.slotId, opened.reason);
  const { identity } = opened.session;

  const slot = findSlot(opened.session.state, request.slotId);
  if (!slot) return answerMissingSlot(opened.session.state, request);
  if (!slot.lease) {
    const known = opened.session.state.released.find((entry) => entry.leaseId === request.expectedLeaseId);
    if (known) return result('already-released', slot.slotId, `This lease was already released: ${known.reason}`);
    return result('recovery-required', slot.slotId, `Slot ${slot.slotId} holds no lease: ${slot.reason}`);
  }
  if (slot.lease.leaseId !== request.expectedLeaseId) {
    return result(
      'stale-lease',
      slot.slotId,
      `Slot ${slot.slotId} now holds lease ${slot.lease.leaseId}, so an older release cannot act on it.`,
    );
  }

  const classification = await classify(slot, request.disposition);
  const removing = request.disposition !== 'preserve' && classification.removable;

  if (!removing) {
    const committed = await commitPoolMutation(identity, (state) => {
      const current = findSlot(state, request.slotId);
      if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: 'stale' as const };
      return { state: preserveSlot(state, current, classification), value: 'preserved' as const };
    });
    if (committed.status !== 'ok') return result('recovery-required', slot.slotId, committed.reason);
    if (committed.value === 'stale') {
      return result('stale-lease', slot.slotId, 'The slot was reassigned before this release was committed.');
    }
    const status = classification.state === 'recovery-required' ? 'recovery-required' : 'preserved';
    return result(status, slot.slotId, classification.reason);
  }

  return removeSlot(workspacePath, identity, slot, request);
}

async function removeSlot(
  workspacePath: string,
  identity: RepositoryIdentity,
  slot: PoolSlot,
  request: AppRuntimeReleaseWorktreeRequest,
): Promise<AppRuntimeReleaseWorktreeResult> {
  const reserved = await commitPoolMutation(identity, (state) => {
    const current = findSlot(state, request.slotId);
    if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: 'stale' as const };
    const now = new Date().toISOString();
    return {
      state: replaceSlot(state, {
        ...current,
        state: 'removing',
        operation: {
          operationId: request.expectedLeaseId,
          pid: process.pid,
          startedAt: now,
          intendedState: 'available',
          leaseId: request.expectedLeaseId,
        },
        reason: 'The checkout is being removed after a proved-clean release.',
        updatedAt: now,
      }),
      value: 'reserved' as const,
    };
  });
  if (reserved.status !== 'ok') return result('recovery-required', slot.slotId, reserved.reason);
  if (reserved.value === 'stale') {
    return result('stale-lease', slot.slotId, 'The slot was reassigned before this release was committed.');
  }

  // No `--force`: cleanliness was proved above, so a Git refusal here is new
  // information and must preserve the checkout rather than override it.
  const outcome = await withGitMutationGate(identity.poolDir, async () => {
    const removal = await removeRegisteredWorktree(workspacePath, slot.path);
    if (removal.status === 'removed' || removal.status === 'not-registered') {
      await pruneWorktreeRegistrations(workspacePath);
    }
    // An external pull-request branch is never deleted, whatever was asked.
    if (removal.status === 'removed'
      && (request.deleteBranch || request.deleteMergedBranch)
      && slot.lease?.branchKind === 'fresh-task'
      && slot.branchName) {
      await deleteWorktreeBranch(workspacePath, slot.branchName, {
        deleteBranch: request.deleteBranch,
        deleteMergedBranch: request.deleteMergedBranch,
      });
    }
    return removal;
  });

  if (outcome.status === 'preserved') {
    const reason = `Git refused to remove the checkout, so it was kept: ${outcome.detail}`;
    await commitPoolMutation(identity, (state) => {
      const current = findSlot(state, request.slotId);
      if (!current) return { value: null };
      const now = new Date().toISOString();
      return {
        state: replaceSlot(state, { ...current, state: 'damaged', operation: null, reason, updatedAt: now }),
        value: null,
      };
    });
    return result('recovery-required', slot.slotId, reason);
  }

  const reason = outcome.status === 'removed'
    ? 'The checkout was clean, so it was removed and its slot returned.'
    : 'Git had no registration for the checkout, so the slot was returned without deleting anything.';
  const now = new Date().toISOString();
  const committed = await commitPoolMutation(identity, (state) => ({
    state: recordRelease(dropSlot(state, request.slotId), {
      slotId: request.slotId,
      leaseId: request.expectedLeaseId,
      status: 'released',
      at: now,
      reason,
    }),
    value: null,
  }));
  if (committed.status !== 'ok') return result('recovery-required', slot.slotId, committed.reason);
  return result('released', slot.slotId, reason);
}
