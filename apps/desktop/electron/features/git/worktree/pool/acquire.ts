import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  AppRuntimeAcquireWorktreeRequest,
  AppRuntimeAcquireWorktreeResult,
  AppRuntimeWorktreeLease,
} from '@sero-ai/common';

import { execWorktreeGit } from '../exec';
import {
  addWorktreeOnExistingBranch,
  addWorktreeOnNewBranch,
  buildTaskBranchName,
  ensureGitReady,
  fetchBranchBestEffort,
  isUsableBranchName,
  refExistsIn,
  resolveCommit,
} from '../provision';
import { resolvePreferredBaseRef } from '../workspace-sync';
import { checkoutCleanliness } from './checkout';
import { withGitMutationGate } from './locks';
import { defaultWorktreeProcessGuard, type WorktreeProcessGuard } from './process-guard';
import { listWorktreeRegistrations } from './registration';
import { canonicalPath, type RepositoryIdentity } from './repository';
import { commitPoolMutation, openPool } from './session';
import { dropSlot, findSlot, replaceSlot } from './state-store';
import type { PoolSlot, PoolState } from './types';

export type AcquireFaultPoint = 'after-reservation' | 'after-checkout' | 'before-final-commit';

export interface AcquireWorktreeDependencies {
  processGuard?: WorktreeProcessGuard;
  fault?: (point: AcquireFaultPoint) => Promise<void> | void;
}

type SlotChoice =
  | { status: 'new'; slotId: string }
  | { status: 'reuse'; slot: PoolSlot }
  | { status: 'blocked'; reason: string };

function blocked(reason: string): AppRuntimeAcquireWorktreeResult {
  return { status: 'blocked', reason };
}

function nextSlotId(state: PoolState): string {
  const highest = state.slots.reduce((max, slot) => {
    const match = /^slot-(\d+)$/.exec(slot.slotId);
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  return `slot-${highest + 1}`;
}

function chooseSlot(state: PoolState, holder: string, allowReuse: boolean): SlotChoice {
  const held = state.slots.find((slot) => slot.state === 'leased' && slot.lease?.leaseHolder === holder);
  if (held) {
    return {
      status: 'blocked',
      reason: `"${holder}" already holds slot ${held.slotId}. Reattach to that lease instead of acquiring a second checkout.`,
    };
  }
  if (allowReuse) {
    const reusable = state.slots
      .filter((slot) => slot.state === 'available' && !slot.lease && !slot.operation && slot.preparedHead)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0];
    if (reusable) return { status: 'reuse', slot: reusable };
  }
  return { status: 'new', slotId: nextSlotId(state) };
}

function newSlot(slotId: string, slotPath: string, workspacePath: string, operationId: string, now: string): PoolSlot {
  return {
    slotId,
    path: slotPath,
    workspacePath,
    state: 'provisioning',
    lease: null,
    operation: {
      operationId,
      pid: process.pid,
      startedAt: now,
      intendedState: 'leased',
      leaseId: null,
      resetTarget: null,
    },
    branchName: null,
    branchKind: null,
    preparedHead: null,
    lastReleased: null,
    reason: 'A checkout is being provisioned for a new lease.',
    legacy: false,
    createdAt: now,
    updatedAt: now,
  };
}

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
    if (!left && slot.preparedHead === null) return { state: dropSlot(state, slotId), value: null };
    const now = new Date().toISOString();
    return {
      state: replaceSlot(state, {
        ...slot,
        state: 'recovery-required',
        operation: null,
        reason: `Provisioning failed and preserved the checkout: ${reason}`,
        updatedAt: now,
      }),
      value: null,
    };
  }).catch(() => undefined);
}

async function proveAvailableSlot(slot: PoolSlot, workspacePath: string, guard: WorktreeProcessGuard): Promise<string | null> {
  const processState = await guard.prepare(slot.path);
  if (processState.status !== 'safe') return processState.reason;
  const cleanliness = await checkoutCleanliness(slot.path);
  if (cleanliness.status !== 'clean') {
    return cleanliness.status === 'dirty'
      ? `The available checkout became dirty: ${cleanliness.detail}`
      : `The available checkout could not be verified clean: ${cleanliness.reason}`;
  }
  const listing = await listWorktreeRegistrations(workspacePath);
  if (listing.status !== 'ok') return `Registration detection failed: ${listing.reason}`;
  if (!listing.nulDelimited) return 'Git cannot provide path-exact NUL-delimited registration evidence.';
  const canonical = await canonicalPath(slot.path);
  const records = await Promise.all(listing.records.map(async (record) => ({
    record,
    path: await canonicalPath(record.path),
  })));
  const registration = records.find((entry) => entry.path === canonical)?.record;
  if (!registration || registration.locked || registration.prunable || !registration.detached) {
    return 'The available slot registration is missing, locked, prunable, or not in its prepared detached state.';
  }
  if (!slot.preparedHead || registration.head !== slot.preparedHead) {
    return 'The available slot HEAD differs from its recorded prepared HEAD.';
  }
  return null;
}

async function checkoutReusedSlot(
  workspacePath: string,
  slotPath: string,
  branchName: string,
  external: boolean,
  baseRef: string | null,
): Promise<void> {
  if (external) {
    if (await refExistsIn(workspacePath, `refs/heads/${branchName}`)) {
      await execWorktreeGit(['switch', branchName], { cwd: slotPath, timeout: 30_000 });
      return;
    }
    if (!await refExistsIn(workspacePath, `refs/remotes/origin/${branchName}`)) {
      throw new Error(`Branch "${branchName}" exists neither locally nor on origin`);
    }
    await execWorktreeGit(['switch', '--track', '-c', branchName, `origin/${branchName}`], {
      cwd: slotPath,
      timeout: 30_000,
    });
    return;
  }
  await execWorktreeGit(['switch', '-c', branchName, ...(baseRef ? [baseRef] : [])], {
    cwd: slotPath,
    timeout: 30_000,
  });
}

export async function acquireWorktree(
  workspacePath: string,
  request: AppRuntimeAcquireWorktreeRequest,
  dependencies: AcquireWorktreeDependencies = {},
): Promise<AppRuntimeAcquireWorktreeResult> {
  return acquire(workspacePath, request, dependencies, true);
}

async function acquire(
  workspacePath: string,
  request: AppRuntimeAcquireWorktreeRequest,
  dependencies: AcquireWorktreeDependencies,
  allowReuse: boolean,
): Promise<AppRuntimeAcquireWorktreeResult> {
  if (!request.holder) return blocked('An acquisition needs a holder key.');
  if (request.existingBranch !== undefined && !isUsableBranchName(request.existingBranch)) {
    return blocked(`Invalid branch name "${request.existingBranch}"`);
  }

  let greenfield = false;
  try {
    greenfield = await ensureGitReady(workspacePath);
  } catch (error) {
    return blocked(`Could not prepare a Git repository at ${workspacePath}: ${String(error)}`);
  }

  const opened = await openPool(workspacePath);
  if (opened.status !== 'ok') return blocked(opened.reason);
  const { identity } = opened.session;
  const external = request.existingBranch !== undefined;
  const branchName = external
    ? (request.existingBranch as string)
    : buildTaskBranchName(request.title, request.holder);
  const alreadyHeld = opened.session.state.slots.find((slot) =>
    slot.state === 'leased' && slot.lease?.leaseHolder === request.holder,
  );
  if (alreadyHeld) {
    return blocked(`"${request.holder}" already holds slot ${alreadyHeld.slotId}. Reattach to that lease instead of acquiring a second checkout.`);
  }
  if (!external && await refExistsIn(opened.session.workspacePath, `refs/heads/${branchName}`)) {
    return blocked(`Fresh branch "${branchName}" already exists. Treat it as reattachment or recovery evidence.`);
  }

  const operationId = randomUUID();
  const reserved = await commitPoolMutation<SlotChoice>(identity, (state) => {
    const choice = chooseSlot(state, request.holder, allowReuse);
    if (choice.status === 'blocked') return { value: choice };
    const now = new Date().toISOString();
    if (choice.status === 'reuse') {
      return {
        state: replaceSlot(state, {
          ...choice.slot,
          state: 'provisioning',
          operation: {
            operationId,
            pid: process.pid,
            startedAt: now,
            intendedState: 'leased',
            leaseId: null,
            resetTarget: null,
          },
          reason: `A proven idle checkout is reserved for "${request.holder}".`,
          updatedAt: now,
        }),
        value: choice,
      };
    }
    const slotPath = path.join(opened.session.poolRoot, choice.slotId);
    return {
      state: replaceSlot(state, newSlot(choice.slotId, slotPath, opened.session.workspacePath, operationId, now)),
      value: choice,
    };
  });
  if (reserved.status !== 'ok') return blocked(reserved.reason);
  if (reserved.value.status === 'blocked') return blocked(reserved.value.reason);
  await dependencies.fault?.('after-reservation');

  const slotId = reserved.value.status === 'reuse' ? reserved.value.slot.slotId : reserved.value.slotId;
  const slotPath = reserved.value.status === 'reuse'
    ? reserved.value.slot.path
    : path.join(opened.session.poolRoot, slotId);

  try {
    const baseRef = external ? null : await resolvePreferredBaseRef(opened.session.workspacePath);
    if (external) await fetchBranchBestEffort(opened.session.workspacePath, branchName);
    const baseCommit = await resolveCommit(opened.session.workspacePath, baseRef ?? 'HEAD');

    if (reserved.value.status === 'reuse') {
      const refusal = await proveAvailableSlot(
        reserved.value.slot,
        opened.session.workspacePath,
        dependencies.processGuard ?? defaultWorktreeProcessGuard,
      );
      if (refusal) {
        await markProvisioningFailed(identity, slotId, slotPath, operationId, refusal);
        console.warn(`[worktree-pool] slot ${slotId} was not reusable: ${refusal}`);
        return acquire(opened.session.workspacePath, request, dependencies, false);
      }
      await checkoutReusedSlot(opened.session.workspacePath, slotPath, branchName, external, baseRef);
    } else {
      await withGitMutationGate(identity.poolDir, async () => {
        if (external) {
          await addWorktreeOnExistingBranch(opened.session.workspacePath, slotPath, branchName, { fetch: false });
        } else {
          await addWorktreeOnNewBranch(
            opened.session.workspacePath,
            slotPath,
            branchName,
            baseRef,
            { reattachExisting: false },
          );
        }
      });
    }
    await dependencies.fault?.('after-checkout');

    const acquiredHead = await resolveCommit(slotPath, 'HEAD');
    const lease: AppRuntimeWorktreeLease = {
      slotId,
      leaseId: randomUUID(),
      leaseHolder: request.holder,
      worktreePath: slotPath,
      branchName,
      branchKind: external ? 'external-pr' : 'fresh-task',
      baseRef,
      baseCommit,
      acquiredHead,
      pullRequestNumber: request.pullRequestNumber ?? null,
      acquiredAt: new Date().toISOString(),
      greenfield,
    };
    await dependencies.fault?.('before-final-commit');
    const committed = await commitPoolMutation<'committed' | 'lost'>(identity, (state) => {
      const slot = findSlot(state, slotId);
      if (!slot || slot.operation?.operationId !== operationId) return { value: 'lost' };
      const now = new Date().toISOString();
      return {
        state: replaceSlot(state, {
          ...slot,
          state: 'leased',
          lease,
          operation: null,
          branchName,
          branchKind: lease.branchKind,
          preparedHead: null,
          reason: `Leased to "${request.holder}" on branch ${branchName}.`,
          updatedAt: now,
        }),
        value: 'committed',
      };
    });
    if (committed.status !== 'ok') return blocked(`The checkout was created but its lease could not be recorded: ${committed.reason}`);
    if (committed.value === 'lost') {
      return blocked(`Slot ${slotId} changed while it was being provisioned, so the checkout was preserved.`);
    }
    console.log(`[worktree-pool] leased ${slotId} to ${request.holder} at ${slotPath} (branch: ${branchName})`);
    return { status: 'acquired', lease };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markProvisioningFailed(identity, slotId, slotPath, operationId, reason);
    return blocked(reason);
  }
}
