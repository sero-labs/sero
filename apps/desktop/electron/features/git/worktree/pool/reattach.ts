/**
 * Restart reattachment: a persisted path is a memory, not a proof.
 *
 * Before a Workflow run or a Room member is allowed back into a checkout, the
 * host proves repository identity, slot, lease, holder, path containment, Git
 * registration and branch. Anything that cannot be proved returns
 * `recovery-required`, which blocks execution instead of guessing.
 *
 * HEAD is deliberately NOT a fence for a live lease. Work legitimately
 * advances HEAD, and amends and rebases move it without losing anything, so
 * demanding the acquisition HEAD would reject exactly the healthy case this
 * call exists to serve. `acquiredHead` stays immutable evidence for judging
 * disposability at release, where it is the right question.
 *
 * A `legacy` request adopts a pre-pool `card-*` checkout, and only when its
 * registration and branch agree with what the consumer persisted. An unmatched
 * legacy directory is left `recovery-required`: no upgrade deletes or
 * reassigns it.
 */

import { randomUUID } from 'node:crypto';

import type {
  AppRuntimeReattachWorktreeRequest,
  AppRuntimeReattachWorktreeResult,
  AppRuntimeWorktreeLease,
} from '@sero-ai/common';

import { listWorktreeRegistrations, registrationBranch } from './registration';
import { worktreesRoot } from './reconcile';
import { canonicalPath, isContainedIn, type RepositoryIdentity } from './repository';
import { commitPoolMutation, openPool } from './session';
import { findSlot, replaceSlot } from './state-store';
import { resolveCommit } from '../provision';
import type { PoolSlot } from './types';

function unproved(reason: string): AppRuntimeReattachWorktreeResult {
  return { status: 'recovery-required', reason };
}

export async function reattachWorktree(
  workspacePath: string,
  request: AppRuntimeReattachWorktreeRequest,
): Promise<AppRuntimeReattachWorktreeResult> {
  const opened = await openPool(workspacePath);
  if (opened.status !== 'ok') return unproved(opened.reason);

  if (request.kind === 'lease') {
    const slot = findSlot(opened.session.state, request.slotId);
    if (!slot) return unproved(`The pool has no slot ${request.slotId}.`);
    // openPool has already re-classified this slot against Git and the
    // filesystem, so anything but `leased` is a disagreement to surface.
    if (slot.state !== 'leased' || !slot.lease) {
      return unproved(`Slot ${request.slotId} is ${slot.state}: ${slot.reason}`);
    }
    if (slot.lease.leaseId !== request.leaseId) {
      return unproved(`Slot ${request.slotId} now holds a different lease.`);
    }
    if (slot.lease.leaseHolder !== request.holder) {
      return unproved(`Slot ${request.slotId} is leased to "${slot.lease.leaseHolder}", not "${request.holder}".`);
    }
    return { status: 'attached', lease: slot.lease };
  }

  return adoptLegacyCheckout(workspacePath, request, opened.session.identity, opened.session.state.slots);
}

async function adoptLegacyCheckout(
  workspacePath: string,
  request: Extract<AppRuntimeReattachWorktreeRequest, { kind: 'legacy' }>,
  identity: RepositoryIdentity,
  slots: PoolSlot[],
): Promise<AppRuntimeReattachWorktreeResult> {
  const canonical = await canonicalPath(request.worktreePath);
  if (!isContainedIn(canonical, worktreesRoot(workspacePath))) {
    return unproved(`${canonical} is not inside this workspace's managed worktree root.`);
  }

  const existing = slots.find((slot) => slot.path === canonical);
  if (existing?.lease && existing.lease.leaseHolder !== request.holder) {
    return unproved(`${canonical} is already leased to "${existing.lease.leaseHolder}".`);
  }
  if (existing?.lease && existing.lease.leaseHolder === request.holder) {
    return { status: 'attached', lease: existing.lease };
  }

  const listing = await listWorktreeRegistrations(workspacePath);
  if (listing.status !== 'ok') {
    return unproved(`Could not read this repository's worktree registrations: ${listing.reason}`);
  }
  const matches = await Promise.all(listing.records.map(async (record) => ({
    record,
    canonical: await canonicalPath(record.path),
  })));
  const registration = matches.find((entry) => entry.canonical === canonical)?.record;
  if (!registration) return unproved(`Git has no worktree registered at ${canonical}.`);
  if (registration.prunable) {
    return unproved(`Git reports ${canonical} prunable: ${registration.prunableReason ?? 'no reason given'}.`);
  }
  if (registration.detached) return unproved(`${canonical} is on a detached HEAD, which is not a Sero work mode.`);

  const branch = registrationBranch(registration);
  if (!branch) return unproved(`${canonical} is not checked out on a branch.`);
  if (request.branchName && request.branchName !== branch) {
    return unproved(`${canonical} is on "${branch}", not the recorded "${request.branchName}".`);
  }

  const lease: AppRuntimeWorktreeLease = {
    slotId: existing?.slotId ?? `legacy-${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    leaseId: randomUUID(),
    leaseHolder: request.holder,
    worktreePath: canonical,
    branchName: branch,
    // A pre-pool checkout's provenance is unknown, and treating it as a fresh
    // task branch would authorise deleting it. `external-pr` is the label that
    // makes cleanup refuse, which is the right way to be uncertain.
    branchKind: 'external-pr',
    baseRef: null,
    baseCommit: null,
    acquiredHead: await resolveCommit(canonical, 'HEAD'),
    acquiredAt: new Date().toISOString(),
    greenfield: false,
  };

  const committed = await commitPoolMutation(identity, (state) => {
    const now = new Date().toISOString();
    const current = findSlot(state, lease.slotId);
    if (current?.lease && current.lease.leaseHolder !== request.holder) return { value: 'taken' as const };
    return {
      state: replaceSlot(state, {
        slotId: lease.slotId,
        path: canonical,
        workspacePath,
        state: 'leased',
        lease,
        operation: null,
        branchName: branch,
        branchKind: lease.branchKind,
        lastReleased: current?.lastReleased ?? null,
        reason: `A pre-pool checkout matched to "${request.holder}" and given a migration lease.`,
        legacy: true,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      }),
      value: 'adopted' as const,
    };
  });
  if (committed.status !== 'ok') return unproved(committed.reason);
  if (committed.value === 'taken') return unproved(`${canonical} was leased to another holder while it was being adopted.`);

  console.log(`[worktree-pool] adopted legacy checkout ${canonical} for ${request.holder} as ${lease.slotId}`);
  return { status: 'attached', lease };
}
