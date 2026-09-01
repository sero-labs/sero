/**
 * Restart reconciliation across three independent sources of evidence:
 * persisted pool state, Git worktree registration, and the directories on
 * disk. Reuse and removal both need every applicable source to agree; any
 * disagreement is `recovery-required`, which is a state a human resolves and
 * never a state the pool silently reuses.
 *
 * Reconciliation only ever RE-CLASSIFIES. It removes no directory, runs no
 * `git worktree prune`, and never promotes an ambiguous slot to `available`.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { canonicalPath, isContainedIn } from './repository';
import { registrationBranch, type WorktreeRegistration } from './registration';
import { replaceSlot } from './state-store';
import type { PoolSlot, PoolState } from './types';
import { isTransitional } from './types';

/** Directory within a workspace where physical checkouts live. */
export const WORKTREES_DIR = path.join('.sero', 'worktrees');

export const SLOT_DIR_PREFIX = 'slot-';
export const LEGACY_DIR_PREFIX = 'card-';

export interface ReconcileInput {
  state: PoolState;
  registrations: WorktreeRegistration[];
  /** The workspace whose physical directories may be enumerated. */
  workspacePath: string;
  /**
   * When the Git and filesystem evidence was collected. A slot recorded after
   * that moment is newer than the evidence, so the evidence cannot classify
   * it: another acquisition is mid-flight and its registration simply did not
   * exist yet when the listing was read.
   */
  evidenceAt: string;
  now: string;
}

export interface ReconcileOutcome {
  state: PoolState;
  changed: boolean;
  /** One line per re-classified slot, for the log and for later diagnosis. */
  notes: string[];
}

export function worktreesRoot(workspacePath: string): string {
  return path.join(workspacePath, WORKTREES_DIR);
}

async function directoryExists(target: string): Promise<boolean> {
  const stats = await fs.stat(target).catch(() => null);
  return stats !== null && stats.isDirectory();
}

async function canonicalRegistrationIndex(
  registrations: WorktreeRegistration[],
): Promise<Map<string, WorktreeRegistration>> {
  const index = new Map<string, WorktreeRegistration>();
  for (const record of registrations) {
    index.set(await canonicalPath(record.path), record);
  }
  return index;
}

function reclassify(slot: PoolSlot, state: PoolSlot['state'], reason: string, now: string): PoolSlot {
  return { ...slot, state, reason, operation: null, updatedAt: now };
}

/**
 * A transitional slot whose owning process is still alive is IN FLIGHT, not
 * interrupted: its `git worktree add` may not have run yet. The pid in the
 * operation record is what separates the two, and it is the same liveness test
 * the rest of Sero's cross-process locking uses. (A pid the OS has since
 * reassigned reads as alive, which errs towards preserving the checkout.)
 */
function operationIsLive(slot: PoolSlot): boolean {
  const pid = slot.operation?.pid;
  if (pid === undefined) return false;
  try {
    // Signal 0 performs the existence check without delivering anything.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * An interrupted transition is only recoverable into `leased` when the lease it
 * was creating is fully evidenced: registration present, branch as recorded,
 * directory on disk. Interrupted recycling and removal are never recoverable
 * automatically — the checkout may be mid-reset, and only an explicit decision
 * can say what it now holds.
 */
function classifyInterrupted(
  slot: PoolSlot,
  registration: WorktreeRegistration | undefined,
  onDisk: boolean,
  now: string,
): PoolSlot {
  if (slot.state === 'provisioning'
    && slot.lease
    && registration
    && !registration.prunable
    && registrationBranch(registration) === slot.lease.branchName
    && onDisk) {
    return reclassify(slot, 'leased', 'Provisioning was interrupted but the checkout is fully evidenced.', now);
  }
  return reclassify(
    slot,
    'recovery-required',
    `A ${slot.state} transition was interrupted, so this checkout needs an explicit decision.`,
    now,
  );
}

function classifyStable(
  slot: PoolSlot,
  registration: WorktreeRegistration | undefined,
  onDisk: boolean,
  now: string,
): PoolSlot {
  if (!registration && !onDisk) {
    return reclassify(slot, 'orphaned', 'Neither Git nor the filesystem still has this checkout.', now);
  }
  if (!registration && onDisk) {
    return reclassify(slot, 'damaged', 'The directory exists but Git has no worktree registered for it.', now);
  }
  if (registration && !onDisk) {
    return reclassify(slot, 'orphaned', 'Git still registers this worktree, but its directory is gone.', now);
  }
  if (registration?.prunable) {
    return reclassify(slot, 'damaged', `Git reports this worktree prunable: ${registration.prunableReason ?? 'no reason given'}.`, now);
  }
  if (registration?.detached) {
    return reclassify(slot, 'recovery-required', 'The checkout is on a detached HEAD, which is not a Sero work mode.', now);
  }
  const branch = registration ? registrationBranch(registration) : null;
  const expected = slot.lease?.branchName ?? slot.branchName;
  if (expected && branch !== expected) {
    return reclassify(slot, 'recovery-required', `The checkout is on "${branch ?? 'no branch'}", not the recorded "${expected}".`, now);
  }
  if (registration?.locked) {
    return reclassify(slot, 'in-use', `Git reports this worktree locked: ${registration.lockedReason ?? 'no reason given'}.`, now);
  }
  return slot;
}

/** Adds unknown physical directories as slots that must never be reused blindly. */
async function adoptUnknownDirectories(
  state: PoolState,
  workspacePath: string,
  registrations: Map<string, WorktreeRegistration>,
  now: string,
): Promise<{ state: PoolState; notes: string[] }> {
  const root = worktreesRoot(workspacePath);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const known = new Set(state.slots.map((slot) => slot.path));
  const notes: string[] = [];
  let next = state;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const isSlot = entry.name.startsWith(SLOT_DIR_PREFIX);
    const isLegacy = entry.name.startsWith(LEGACY_DIR_PREFIX);
    if (!isSlot && !isLegacy) continue;
    const canonical = await canonicalPath(path.join(root, entry.name));
    if (known.has(canonical)) continue;

    const registration = registrations.get(canonical);
    const branch = registration ? registrationBranch(registration) : null;
    next = replaceSlot(next, {
      slotId: `adopted-${entry.name}`,
      path: canonical,
      workspacePath,
      state: 'recovery-required',
      lease: null,
      operation: null,
      branchName: branch,
      branchKind: null,
      lastReleased: null,
      reason: isLegacy
        ? 'A pre-pool checkout with no owner recorded in this pool. It is preserved until its owner is proved.'
        : 'A checkout directory the pool has no record of. It is preserved until it is classified.',
      legacy: isLegacy,
      createdAt: now,
      updatedAt: now,
    });
    notes.push(`adopted ${entry.name} as recovery-required`);
  }
  return { state: next, notes };
}

export async function reconcilePoolState(input: ReconcileInput): Promise<ReconcileOutcome> {
  const { registrations, workspacePath, now } = input;
  const index = await canonicalRegistrationIndex(registrations);
  const notes: string[] = [];
  let state = input.state;

  for (const slot of input.state.slots) {
    // Evidence older than the record cannot classify the record.
    if (slot.updatedAt > input.evidenceAt) continue;
    if (isTransitional(slot.state) && operationIsLive(slot)) continue;
    const canonical = await canonicalPath(slot.path);
    const registration = index.get(canonical);
    const onDisk = await directoryExists(canonical);
    const owned = isContainedIn(canonical, worktreesRoot(slot.workspacePath));

    let updated = { ...slot, path: canonical };
    if (!owned) {
      updated = reclassify(updated, 'recovery-required', 'The recorded path is outside the workspace pool root.', now);
    } else if (isTransitional(slot.state)) {
      updated = classifyInterrupted(updated, registration, onDisk, now);
    } else {
      updated = classifyStable(updated, registration, onDisk, now);
    }

    if (updated.state !== slot.state || updated.path !== slot.path) {
      notes.push(`${slot.slotId}: ${slot.state} → ${updated.state} (${updated.reason})`);
      state = replaceSlot(state, updated);
    }
  }

  const adopted = await adoptUnknownDirectories(state, workspacePath, index, now);
  return {
    state: adopted.state,
    changed: notes.length > 0 || adopted.notes.length > 0,
    notes: [...notes, ...adopted.notes],
  };
}
