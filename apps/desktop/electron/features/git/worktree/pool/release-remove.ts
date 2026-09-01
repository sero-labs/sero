import type { AppRuntimeReleaseWorktreeRequest, AppRuntimeReleaseWorktreeResult } from '@sero-ai/common';

import {
  deleteWorktreeBranch,
  pruneWorktreeRegistrations,
  removeRegisteredWorktree,
} from '../removal';
import { withGitMutationGate } from './locks';
import type { WorktreeProcessGuard } from './process-guard';
import type { RepositoryIdentity } from './repository';
import { commitPoolMutation } from './session';
import { dropSlot, findSlot, replaceSlot } from './state-store';
import { recordRelease, type PoolSlot } from './types';

function result(
  status: AppRuntimeReleaseWorktreeResult['status'],
  slotId: string,
  reason: string,
  checkout: AppRuntimeReleaseWorktreeResult['checkout'],
): AppRuntimeReleaseWorktreeResult {
  return { status, slotId, reason, checkout };
}

export async function removeReleasedSlot(
  workspacePath: string,
  identity: RepositoryIdentity,
  slot: PoolSlot,
  request: AppRuntimeReleaseWorktreeRequest,
  processGuard: WorktreeProcessGuard,
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
          resetTarget: null,
        },
        reason: 'The checkout is being removed after a proved-clean release.',
        updatedAt: now,
      }),
      value: 'reserved' as const,
    };
  });
  if (reserved.status !== 'ok') return result('recovery-required', slot.slotId, reserved.reason, 'retained');
  if (reserved.value === 'stale') return result('stale-lease', slot.slotId, 'The slot changed before removal.', 'unknown');

  const processes = await processGuard.prepare(slot.path);
  if (processes.status !== 'safe') {
    const reason = processes.reason;
    await commitPoolMutation(identity, (state) => {
      const current = findSlot(state, slot.slotId);
      if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: null };
      return {
        state: replaceSlot(state, {
          ...current,
          state: 'leased',
          operation: null,
          reason,
          updatedAt: new Date().toISOString(),
        }),
        value: null,
      };
    });
    return result(processes.status === 'unverifiable' ? 'recovery-required' : 'preserved', slot.slotId, reason, 'retained');
  }

  const outcome = await withGitMutationGate(identity.poolDir, async () => {
    const removal = await removeRegisteredWorktree(workspacePath, slot.path);
    if (removal.status === 'removed') await pruneWorktreeRegistrations(workspacePath);
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
      return {
        state: replaceSlot(state, {
          ...current,
          state: 'damaged',
          operation: null,
          reason,
          updatedAt: new Date().toISOString(),
        }),
        value: null,
      };
    });
    return result('recovery-required', slot.slotId, reason, 'retained');
  }

  if (outcome.status === 'not-registered') {
    const reason = `Git no longer registered the checkout, so ownership evidence was preserved: ${outcome.detail}`;
    await commitPoolMutation(identity, (state) => {
      const current = findSlot(state, request.slotId);
      if (!current || current.lease?.leaseId !== request.expectedLeaseId) return { value: null };
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
    });
    return result('recovery-required', slot.slotId, reason, 'unknown');
  }

  const reason = 'The checkout was clean, so it was removed and its slot returned.';
  const now = new Date().toISOString();
  const committed = await commitPoolMutation<'committed' | 'stale'>(identity, (state) => {
    const current = findSlot(state, request.slotId);
    if (!current || current.lease?.leaseId !== request.expectedLeaseId
      || current.operation?.operationId !== request.expectedLeaseId) {
      return { value: 'stale' };
    }
    return {
      state: recordRelease(dropSlot(state, request.slotId), {
        slotId: request.slotId,
        leaseId: request.expectedLeaseId,
        disposition: request.disposition,
        status: 'released',
        at: now,
        reason,
      }),
      value: 'committed',
    };
  });
  if (committed.status !== 'ok') return result('recovery-required', slot.slotId, committed.reason, 'removed');
  if (committed.value === 'stale') {
    return result('recovery-required', slot.slotId, 'The checkout was removed but its final state fence did not match.', 'removed');
  }
  return result('released', slot.slotId, reason, 'removed');
}
