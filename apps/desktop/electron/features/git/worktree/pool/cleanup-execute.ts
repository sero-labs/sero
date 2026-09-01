import { randomUUID } from 'node:crypto';

import type {
  AppRuntimeExecuteWorktreeCleanupPlanResult,
  AppRuntimeWorktreeCleanupFingerprint,
  AppRuntimeWorktreeCleanupSlotResult,
  AppRuntimeWorktreePoolSlotStatus,
} from '@sero-ai/common';

import { removeRegisteredWorktree } from '../removal';
import {
  cleanupFingerprintsEqual,
  getWorktreePoolStatus,
  type CleanupInspectionDependencies,
} from './cleanup-inspection';
import {
  defaultCleanupPlanStore,
  type CleanupPlanStore,
} from './cleanup-plans';
import { withGitMutationGate } from './locks';
import {
  defaultWorktreeProcessGuard,
  type WorktreeProcessGuard,
} from './process-guard';
import { canonicalPath, resolveRepositoryIdentity } from './repository';
import { commitPoolMutation } from './session';
import { dropSlot, findSlot, replaceSlot } from './state-store';
import type { PoolSlot } from './types';

export type CleanupFaultPoint =
  | 'after-confirmation'
  | 'after-reservation'
  | 'after-process-shutdown'
  | 'before-git-operation'
  | 'after-physical-success'
  | 'after-slot-commit';

export interface ExecuteCleanupDependencies extends CleanupInspectionDependencies {
  plans?: CleanupPlanStore;
  newOperationId?: () => string;
  removeWorktree?: typeof removeRegisteredWorktree;
  fault?: (point: CleanupFaultPoint, slotId?: string) => Promise<void> | void;
}

interface ExecutionContext {
  workspacePath: string;
  identity: Awaited<ReturnType<typeof resolveRepositoryIdentity>> & { status: 'ok' };
  processGuard: WorktreeProcessGuard;
  expectedRevision: number;
  dependencies: ExecuteCleanupDependencies;
}

type ReservationResult =
  | { status: 'reserved'; operationId: string; slot: PoolSlot }
  | { status: 'stale'; reason: string };

function rejected(planId: string, reason: string): AppRuntimeExecuteWorktreeCleanupPlanResult {
  return { status: 'rejected', planId, reason };
}

function slotResult(
  outcome: AppRuntimeWorktreeCleanupSlotResult['outcome'],
  slotId: string,
  reason: string,
): AppRuntimeWorktreeCleanupSlotResult {
  return { outcome, slotId, reason } as AppRuntimeWorktreeCleanupSlotResult;
}

function stateMatchesFingerprint(slot: PoolSlot, expected: AppRuntimeWorktreeCleanupFingerprint): boolean {
  return slot.slotId === expected.slotId
    && slot.state === expected.slotState
    && (slot.lease?.leaseId ?? null) === expected.leaseId
    && slot.path === expected.canonicalPath
    && slot.workspacePath === expected.workspacePath
    && slot.branchName === expected.branchName
    && slot.branchKind === expected.branchKind
    && slot.preparedHead === expected.preparedHead
    && JSON.stringify(slot.operation?.resetTarget ?? null) === JSON.stringify(expected.resetTarget);
}

function externalEvidenceMatches(
  expected: AppRuntimeWorktreeCleanupFingerprint,
  current: AppRuntimeWorktreeCleanupFingerprint,
): boolean {
  return expected.repositoryId === current.repositoryId
    && expected.slotId === current.slotId
    && expected.leaseId === current.leaseId
    && expected.canonicalPath === current.canonicalPath
    && expected.workspacePath === current.workspacePath
    && expected.branchName === current.branchName
    && expected.branchKind === current.branchKind
    && expected.head === current.head
    && expected.preparedHead === current.preparedHead
    && JSON.stringify(expected.registration) === JSON.stringify(current.registration)
    && expected.filesystem === current.filesystem
    && expected.cleanliness === current.cleanliness
    && current.process === 'clear';
}

async function currentSlotStatus(
  context: ExecutionContext,
  slotId: string,
): Promise<{ status: 'ok'; slot: AppRuntimeWorktreePoolSlotStatus; revision: number } | { status: 'failed'; reason: string }> {
  const status = await getWorktreePoolStatus(context.workspacePath, {
    now: context.dependencies.now,
    processGuard: context.processGuard,
  });
  if (status.status !== 'ok') return { status: 'failed', reason: status.reason };
  const slot = status.pool.slots.find((candidate) => candidate.slotId === slotId);
  if (!slot) return { status: 'failed', reason: 'The slot no longer exists in pool state.' };
  return { status: 'ok', slot, revision: status.pool.revision };
}

async function readFence(
  context: ExecutionContext,
  planned: AppRuntimeWorktreePoolSlotStatus,
): Promise<AppRuntimeWorktreeCleanupSlotResult | null> {
  const current = await currentSlotStatus(context, planned.slotId);
  if (current.status !== 'ok') return slotResult('skipped-stale', planned.slotId, current.reason);
  if (current.revision !== context.expectedRevision
    || !cleanupFingerprintsEqual(current.slot.fingerprint, planned.fingerprint)) {
    return slotResult('skipped-stale', planned.slotId, 'Pool or checkout evidence changed after planning.');
  }
  const fenced = await commitPoolMutation(context.identity.identity, (state) => ({
    value: state.revision === context.expectedRevision
      && !!findSlot(state, planned.slotId)
      && stateMatchesFingerprint(findSlot(state, planned.slotId) as PoolSlot, planned.fingerprint),
  }));
  if (fenced.status !== 'ok' || !fenced.value) {
    return slotResult('skipped-stale', planned.slotId, 'Pool state changed while the plan was being confirmed.');
  }
  return null;
}

async function reserve(
  context: ExecutionContext,
  planned: AppRuntimeWorktreePoolSlotStatus,
): Promise<ReservationResult> {
  const operationId = (context.dependencies.newOperationId ?? randomUUID)();
  const reserved = await commitPoolMutation<ReservationResult>(context.identity.identity, (state) => {
    const slot = findSlot(state, planned.slotId);
    if (state.revision !== context.expectedRevision || !slot
      || !stateMatchesFingerprint(slot, planned.fingerprint)) {
      return { value: { status: 'stale' as const, reason: 'Pool state changed before reservation.' } };
    }
    const now = (context.dependencies.now ?? (() => new Date()))().toISOString();
    return {
      state: replaceSlot(state, {
        ...slot,
        state: 'removing',
        operation: {
          operationId,
          pid: process.pid,
          startedAt: now,
          intendedState: 'available',
          leaseId: null,
          resetTarget: null,
        },
        reason: `Confirmed cleanup operation ${operationId} reserved this exact checkout.`,
        updatedAt: now,
      }),
      value: { status: 'reserved' as const, operationId, slot },
    };
  });
  if (reserved.status !== 'ok') return { status: 'stale', reason: reserved.reason };
  if (reserved.value.status !== 'reserved') return reserved.value;
  context.expectedRevision = reserved.state.revision;
  return reserved.value;
}

async function markRecoveryRequired(
  context: ExecutionContext,
  slotId: string,
  operationId: string,
  reason: string,
): Promise<void> {
  const committed = await commitPoolMutation(context.identity.identity, (state) => {
    const current = findSlot(state, slotId);
    if (state.revision !== context.expectedRevision
      || current?.operation?.operationId !== operationId) return { value: false };
    return {
      state: replaceSlot(state, {
        ...current,
        state: 'recovery-required',
        operation: null,
        reason,
        updatedAt: (context.dependencies.now ?? (() => new Date()))().toISOString(),
      }),
      value: true,
    };
  });
  if (committed.status === 'ok' && committed.value) context.expectedRevision = committed.state.revision;
}

async function verifyReservedExternalEvidence(
  context: ExecutionContext,
  planned: AppRuntimeWorktreePoolSlotStatus,
  operationId: string,
): Promise<string | null> {
  const current = await currentSlotStatus(context, planned.slotId);
  if (current.status !== 'ok') return current.reason;
  if (current.revision !== context.expectedRevision
    || !externalEvidenceMatches(planned.fingerprint, current.slot.fingerprint)) {
    return 'Git, filesystem, process, branch, HEAD, path or registration evidence changed after reservation.';
  }
  const fenced = await commitPoolMutation(context.identity.identity, (state) => {
    const slot = findSlot(state, planned.slotId);
    return { value: state.revision === context.expectedRevision && slot?.operation?.operationId === operationId };
  });
  return fenced.status === 'ok' && fenced.value ? null : 'The cleanup reservation changed before execution.';
}

async function commitPhysicalSuccess(
  context: ExecutionContext,
  planned: AppRuntimeWorktreePoolSlotStatus,
  operationId: string,
): Promise<boolean> {
  const committed = await commitPoolMutation(context.identity.identity, (state) => {
    const slot = findSlot(state, planned.slotId);
    if (state.revision !== context.expectedRevision || slot?.operation?.operationId !== operationId) {
      return { value: false };
    }
    return { state: dropSlot(state, planned.slotId), value: true };
  });
  if (committed.status !== 'ok' || !committed.value) return false;
  context.expectedRevision = committed.state.revision;
  return true;
}

async function executeAction(
  context: ExecutionContext,
  planned: AppRuntimeWorktreePoolSlotStatus,
): Promise<AppRuntimeWorktreeCleanupSlotResult> {
  const stale = await readFence(context, planned);
  if (stale) return stale;
  if (planned.action.kind === 'preserve') {
    return slotResult('preserved', planned.slotId, planned.action.reason);
  }

  const reservation = await reserve(context, planned);
  if (reservation.status !== 'reserved') return slotResult('skipped-stale', planned.slotId, reservation.reason);
  await context.dependencies.fault?.('after-reservation', planned.slotId);

  if (planned.fingerprint.filesystem === 'directory') {
    const processes = await context.processGuard.prepare(reservation.slot.path);
    if (processes.status !== 'safe') {
      await markRecoveryRequired(context, planned.slotId, reservation.operationId, processes.reason);
      return slotResult(processes.status === 'unverifiable' ? 'recovery-required' : 'preserved', planned.slotId, processes.reason);
    }
  }
  await context.dependencies.fault?.('after-process-shutdown', planned.slotId);

  if (planned.action.kind === 'repair'
    && planned.action.recovery === 'drop-absent-slot-record') {
    const drift = await verifyReservedExternalEvidence(context, planned, reservation.operationId);
    if (drift) {
      await markRecoveryRequired(context, planned.slotId, reservation.operationId, drift);
      return slotResult('skipped-stale', planned.slotId, drift);
    }
    if (!await commitPhysicalSuccess(context, planned, reservation.operationId)) {
      return slotResult('recovery-required', planned.slotId, 'The absent slot record could not be committed safely.');
    }
    return slotResult('repaired', planned.slotId, planned.action.reason);
  }

  const removeWorktree = context.dependencies.removeWorktree ?? removeRegisteredWorktree;
  const gated = await withGitMutationGate(context.identity.identity.poolDir, async () => {
    const drift = await verifyReservedExternalEvidence(context, planned, reservation.operationId);
    if (drift) return { status: 'stale' as const, reason: drift };
    await context.dependencies.fault?.('before-git-operation', planned.slotId);
    const removal = await removeWorktree(
      context.workspacePath,
      reservation.slot.path,
      planned.action.kind === 'repair' ? { force: true } : undefined,
    );
    return { status: 'complete' as const, removal };
  });
  if (gated.status === 'stale') {
    await markRecoveryRequired(context, planned.slotId, reservation.operationId, gated.reason);
    return slotResult('skipped-stale', planned.slotId, gated.reason);
  }
  const { removal } = gated;
  if (removal.status !== 'removed') {
    const reason = `Git did not complete the exact-path operation: ${removal.detail}`;
    await markRecoveryRequired(context, planned.slotId, reservation.operationId, reason);
    return slotResult(removal.status === 'preserved' ? 'failed' : 'recovery-required', planned.slotId, reason);
  }
  await context.dependencies.fault?.('after-physical-success', planned.slotId);
  if (!await commitPhysicalSuccess(context, planned, reservation.operationId)) {
    return slotResult('recovery-required', planned.slotId, 'Physical cleanup succeeded, but the final pool-state fence could not be committed.');
  }
  return slotResult(planned.action.kind === 'remove' ? 'removed' : 'repaired', planned.slotId, planned.action.reason);
}

export async function executeWorktreeCleanupPlan(
  workspacePath: string,
  planId: string,
  dependencies: ExecuteCleanupDependencies = {},
): Promise<AppRuntimeExecuteWorktreeCleanupPlanResult> {
  const now = (dependencies.now ?? (() => new Date()))();
  const consumed = (dependencies.plans ?? defaultCleanupPlanStore).consume(planId, now);
  if (consumed.status !== 'ok') return rejected(planId, consumed.reason);
  await dependencies.fault?.('after-confirmation');

  const canonicalWorkspace = await canonicalPath(workspacePath);
  if (canonicalWorkspace !== consumed.stored.workspacePath) {
    return rejected(planId, 'The plan belongs to a different canonical workspace path.');
  }
  const identity = await resolveRepositoryIdentity(canonicalWorkspace);
  if (identity.status !== 'ok') return rejected(planId, identity.reason);
  if (identity.identity.repositoryId !== consumed.stored.plan.repositoryId) {
    return rejected(planId, 'The plan belongs to a different repository identity.');
  }

  const context: ExecutionContext = {
    workspacePath: canonicalWorkspace,
    identity,
    processGuard: dependencies.processGuard ?? defaultWorktreeProcessGuard,
    expectedRevision: consumed.stored.plan.poolRevision,
    dependencies,
  };
  const results: AppRuntimeWorktreeCleanupSlotResult[] = [];
  for (const planned of consumed.stored.plan.slots) {
    results.push(await executeAction(context, planned));
    await dependencies.fault?.('after-slot-commit', planned.slotId);
  }
  return { status: 'executed', planId, results };
}
