/**
 * Acquisition: one holder, one new lease, one physical checkout.
 *
 * PR 1 deliberately does NOT reuse a slot. Reuse needs every precondition in
 * the plan proved — no live process, clean including untracked files, valid
 * registration, and disposability against the exact reset target — and none of
 * that exists yet. `chooseSlot` is the single place PR 2 changes; until then it
 * always allocates a new slot, so no checkout can be reset under work that is
 * still on disk.
 *
 * The transaction is: reserve under the state lock, do network work outside
 * every lock, mutate Git registration under the Git-mutation gate, then commit
 * under the state lock only if the reservation is still ours.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  AppRuntimeAcquireWorktreeRequest,
  AppRuntimeAcquireWorktreeResult,
  AppRuntimeWorktreeLease,
} from '@sero-ai/common';

import { resolvePreferredBaseRef } from '../workspace-sync';
import {
  addWorktreeOnExistingBranch,
  addWorktreeOnNewBranch,
  buildTaskBranchName,
  ensureGitReady,
  fetchBranchBestEffort,
  isUsableBranchName,
  resolveCommit,
} from '../provision';
import { withGitMutationGate } from './locks';
import { worktreesRoot } from './reconcile';
import { canonicalPath, type RepositoryIdentity } from './repository';
import { commitPoolMutation, openPool } from './session';
import { dropSlot, findSlot, replaceSlot } from './state-store';
import type { PoolSlot, PoolState } from './types';

/** Outcome of choosing a slot: a new allocation, or a refusal with its reason. */
type SlotChoice = { status: 'new' } | { status: 'blocked'; reason: string };

function blocked(reason: string): AppRuntimeAcquireWorktreeResult {
  return { status: 'blocked', reason };
}

/**
 * PR 1: always a new slot. A slot that is already leased to this holder is
 * evidence of a restart, not a second acquisition — the caller must reattach.
 */
function chooseSlot(state: PoolState, holder: string): SlotChoice {
  const held = state.slots.find((slot) => slot.state === 'leased' && slot.lease?.leaseHolder === holder);
  if (held) {
    return {
      status: 'blocked',
      reason: `"${holder}" already holds slot ${held.slotId}. Reattach to that lease instead of acquiring a second checkout.`,
    };
  }
  return { status: 'new' };
}

function newSlot(
  slotId: string,
  slotPath: string,
  workspacePath: string,
  operationId: string,
  now: string,
): PoolSlot {
  return {
    slotId,
    path: slotPath,
    workspacePath,
    state: 'provisioning',
    lease: null,
    operation: { operationId, pid: process.pid, startedAt: now, intendedState: 'leased', leaseId: null },
    branchName: null,
    branchKind: null,
    lastReleased: null,
    reason: 'A checkout is being provisioned for a new lease.',
    legacy: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Records that provisioning failed, without deleting anything it may have
 * left. A reservation that never reached the filesystem is dropped — there is
 * nothing to preserve, and keeping it would leave a phantom slot for every
 * failed acquisition. A directory that DOES exist is kept and flagged, because
 * only an explicit decision can say what is in it.
 */
async function markProvisioningFailed(
  identity: RepositoryIdentity,
  slotId: string,
  slotPath: string,
  operationId: string,
  reason: string,
): Promise<void> {
  const left = (await fs.stat(slotPath).catch(() => null)) !== null;
  await commitPoolMutation(identity, (state) => {
    const slot = findSlot(state, slotId);
    if (!slot || slot.operation?.operationId !== operationId) return { value: null };
    if (!left) return { state: dropSlot(state, slotId), value: null };
    const now = new Date().toISOString();
    return {
      state: replaceSlot(state, {
        ...slot,
        state: 'recovery-required',
        operation: null,
        reason: `Provisioning failed and left an unproved checkout: ${reason}`,
        updatedAt: now,
      }),
      value: null,
    };
  }).catch(() => undefined);
}

export async function acquireWorktree(
  workspacePath: string,
  request: AppRuntimeAcquireWorktreeRequest,
): Promise<AppRuntimeAcquireWorktreeResult> {
  if (!request.holder) return blocked('An acquisition needs a holder key.');
  if (request.existingBranch !== undefined && !isUsableBranchName(request.existingBranch)) {
    return blocked(`Invalid branch name "${request.existingBranch}"`);
  }

  // Greenfield bootstrap has to happen before repository identity resolves.
  let greenfield = false;
  try {
    greenfield = await ensureGitReady(workspacePath);
  } catch (error) {
    return blocked(`Could not prepare a Git repository at ${workspacePath}: ${String(error)}`);
  }

  const opened = await openPool(workspacePath);
  if (opened.status !== 'ok') return blocked(opened.reason);
  const { identity } = opened.session;

  const choice = chooseSlot(opened.session.state, request.holder);
  if (choice.status === 'blocked') return blocked(choice.reason);

  const slotId = `slot-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const slotPath = await canonicalPath(path.join(worktreesRoot(workspacePath), slotId));
  const operationId = randomUUID();

  const reserved = await commitPoolMutation<SlotChoice>(identity, (state) => {
    const now = new Date().toISOString();
    // Re-check under the lock: another process may have acquired for this
    // holder between openPool and here.
    const recheck = chooseSlot(state, request.holder);
    if (recheck.status === 'blocked') return { value: recheck };
    if (state.slots.some((slot) => slot.path === slotPath)) {
      return { value: { status: 'blocked', reason: `Slot path ${slotPath} is already recorded.` } };
    }
    return {
      state: replaceSlot(state, newSlot(slotId, slotPath, workspacePath, operationId, now)),
      value: { status: 'new' },
    };
  });
  if (reserved.status !== 'ok') return blocked(reserved.reason);
  if (reserved.value.status === 'blocked') return blocked(reserved.value.reason);

  try {
    return await provision(identity, workspacePath, request, {
      slotId,
      slotPath,
      operationId,
      greenfield,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markProvisioningFailed(identity, slotId, slotPath, operationId, reason);
    return blocked(reason);
  }
}

interface ProvisionContext {
  slotId: string;
  slotPath: string;
  operationId: string;
  greenfield: boolean;
}

async function provision(
  identity: RepositoryIdentity,
  workspacePath: string,
  request: AppRuntimeAcquireWorktreeRequest,
  ctx: ProvisionContext,
): Promise<AppRuntimeAcquireWorktreeResult> {
  const external = request.existingBranch !== undefined;

  // Network work happens outside both locks so independent acquisitions overlap.
  const baseRef = external ? null : await resolvePreferredBaseRef(workspacePath);
  if (external) await fetchBranchBestEffort(workspacePath, request.existingBranch as string);

  const branchName = external
    ? (request.existingBranch as string)
    : buildTaskBranchName(request.title, request.holder);
  const baseCommit = await resolveCommit(workspacePath, baseRef ?? 'HEAD');

  // Only the registration-changing command is serialised.
  await withGitMutationGate(identity.poolDir, async () => {
    if (external) {
      await addWorktreeOnExistingBranch(workspacePath, ctx.slotPath, branchName, { fetch: false });
    } else {
      await addWorktreeOnNewBranch(workspacePath, ctx.slotPath, branchName, baseRef);
    }
  });

  const acquiredHead = await resolveCommit(ctx.slotPath, 'HEAD');
  const lease: AppRuntimeWorktreeLease = {
    slotId: ctx.slotId,
    leaseId: randomUUID(),
    leaseHolder: request.holder,
    worktreePath: ctx.slotPath,
    branchName,
    branchKind: external ? 'external-pr' : 'fresh-task',
    baseRef,
    baseCommit,
    acquiredHead,
    acquiredAt: new Date().toISOString(),
    greenfield: ctx.greenfield,
  };

  const committed = await commitPoolMutation<'committed' | 'lost'>(identity, (state) => {
    const slot = findSlot(state, ctx.slotId);
    if (!slot || slot.operation?.operationId !== ctx.operationId) {
      return { value: 'lost' };
    }
    const now = new Date().toISOString();
    return {
      state: replaceSlot(state, {
        ...slot,
        state: 'leased',
        lease,
        operation: null,
        branchName,
        branchKind: lease.branchKind,
        reason: `Leased to "${request.holder}" on branch ${branchName}.`,
        updatedAt: now,
      }),
      value: 'committed',
    };
  });

  if (committed.status !== 'ok') {
    return blocked(`The checkout was created but its lease could not be recorded: ${committed.reason}`);
  }
  if (committed.value === 'lost') {
    return blocked(
      `Slot ${ctx.slotId} was reassigned while it was being provisioned, so the new checkout was preserved rather than used.`,
    );
  }

  console.log(`[worktree-pool] leased ${ctx.slotId} to ${request.holder} at ${ctx.slotPath} (branch: ${branchName})`);
  return { status: 'acquired', lease };
}
