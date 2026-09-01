import { promises as fs } from 'node:fs';

import type {
  AppRuntimeWorktreeCleanupAction,
  AppRuntimeWorktreeCleanupClassification,
  AppRuntimeWorktreeCleanupFingerprint,
  AppRuntimeWorktreeFilesystemEvidence,
  AppRuntimeWorktreePoolSlotStatus,
  AppRuntimeWorktreePoolStatus,
  AppRuntimeWorktreePoolStatusResult,
  AppRuntimeWorktreeRegistrationClassification,
} from '@sero-ai/common';

import { resolveCommit } from '../provision';
import { checkoutCleanliness } from './checkout';
import { canonicalWorktreesRoot } from './paths';
import {
  defaultWorktreeProcessGuard,
  type WorktreeProcessGuard,
} from './process-guard';
import {
  listWorktreeRegistrations,
  registrationBranch,
  type WorktreeRegistration,
} from './registration';
import { canonicalPath, isContainedIn, resolveRepositoryIdentity } from './repository';
import { readPoolState } from './state-store';
import { emptyPoolState, isTransitional, type PoolSlot } from './types';

export interface CleanupInspectionDependencies {
  now?: () => Date;
  processGuard?: WorktreeProcessGuard;
}

type RegistrationEvidence = AppRuntimeWorktreeCleanupFingerprint['registration'] & {
  record: WorktreeRegistration | null;
};

function unavailable(reason: string): AppRuntimeWorktreePoolStatusResult {
  return { status: 'unavailable', reason };
}

async function filesystemEvidence(target: string): Promise<AppRuntimeWorktreeFilesystemEvidence> {
  try {
    const stats = await fs.stat(target);
    return stats.isDirectory() ? 'directory' : 'other';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    return 'unverifiable';
  }
}

async function registrationEvidence(
  slotPath: string,
  records: WorktreeRegistration[],
  pathExact: boolean,
): Promise<RegistrationEvidence> {
  if (!pathExact) return emptyRegistration('unverifiable');
  const matches: WorktreeRegistration[] = [];
  for (const record of records) {
    if (await canonicalPath(record.path) === slotPath) matches.push(record);
  }
  if (matches.length === 0) return emptyRegistration('missing');
  if (matches.length !== 1) return emptyRegistration('conflicting');
  const record = matches[0];
  return {
    classification: 'exact',
    head: record.head,
    branchName: registrationBranch(record),
    detached: record.detached,
    bare: record.bare,
    locked: record.locked,
    lockedReason: record.lockedReason,
    prunable: record.prunable,
    prunableReason: record.prunableReason,
    record,
  };
}

function emptyRegistration(
  classification: AppRuntimeWorktreeRegistrationClassification,
): RegistrationEvidence {
  return {
    classification,
    head: null,
    branchName: null,
    detached: false,
    bare: false,
    locked: false,
    lockedReason: null,
    prunable: false,
    prunableReason: null,
    record: null,
  };
}

function preserve(reason: string): {
  classification: AppRuntimeWorktreeCleanupClassification;
  action: AppRuntimeWorktreeCleanupAction;
} {
  return { classification: 'preserved', action: { kind: 'preserve', reason } };
}

function classify(
  slot: PoolSlot,
  evidence: {
    owned: boolean;
    canonicalMatches: boolean;
    filesystem: AppRuntimeWorktreeFilesystemEvidence;
    registration: RegistrationEvidence;
    head: string | null;
    cleanliness: AppRuntimeWorktreeCleanupFingerprint['cleanliness'];
    process: AppRuntimeWorktreeCleanupFingerprint['process'];
  },
): { classification: AppRuntimeWorktreeCleanupClassification; action: AppRuntimeWorktreeCleanupAction } {
  if (!evidence.owned || !evidence.canonicalMatches) {
    return preserve('The recorded path is not an exact canonical pool-owned path.');
  }
  if (slot.lease || slot.state === 'leased') {
    return preserve('The slot has an active lease and remains owned by its exact lease holder.');
  }
  if (isTransitional(slot.state)) {
    return preserve(`The ${slot.state} transition is incomplete and requires recovery.`);
  }
  if (slot.state === 'orphaned' && evidence.filesystem === 'missing') {
    if (evidence.registration.classification === 'exact') {
      return {
        classification: 'recoverable-registration',
        action: {
          kind: 'repair',
          recovery: 'remove-missing-checkout-registration',
          reason: 'The checkout is absent, but Git still has this exact pool-owned registration.',
        },
      };
    }
    if (evidence.registration.classification === 'missing') {
      return {
        classification: 'recoverable-record',
        action: {
          kind: 'repair',
          recovery: 'drop-absent-slot-record',
          reason: 'Neither the filesystem nor Git has this unleased checkout; only its pool record remains.',
        },
      };
    }
  }
  if (slot.state !== 'available') return preserve(`${slot.state}: ${slot.reason}`);
  if (evidence.filesystem !== 'directory') return preserve(`Filesystem evidence is ${evidence.filesystem}.`);
  if (evidence.registration.classification !== 'exact') {
    return preserve(`Registration evidence is ${evidence.registration.classification}.`);
  }
  if (evidence.registration.bare || evidence.registration.locked
    || evidence.registration.prunable || !evidence.registration.detached) {
    return preserve('The idle registration is bare, locked, prunable, or not detached.');
  }
  if (!slot.preparedHead || evidence.registration.head !== slot.preparedHead
    || evidence.head !== slot.preparedHead) {
    return preserve('The checkout HEAD does not equal its proved prepared HEAD.');
  }
  if (evidence.cleanliness !== 'clean') return preserve(`Checkout cleanliness is ${evidence.cleanliness}.`);
  if (evidence.process !== 'clear') return preserve(`Process evidence is ${evidence.process}.`);
  return {
    classification: 'removable-idle',
    action: { kind: 'remove', reason: 'This proved-safe idle checkout may be removed.' },
  };
}

async function inspectSlot(
  repositoryId: string,
  slot: PoolSlot,
  registrations: WorktreeRegistration[],
  pathExact: boolean,
  processGuard: WorktreeProcessGuard,
): Promise<AppRuntimeWorktreePoolSlotStatus> {
  const canonical = await canonicalPath(slot.path);
  const filesystem = await filesystemEvidence(canonical);
  const registration = await registrationEvidence(canonical, registrations, pathExact);
  const poolRoot = await canonicalWorktreesRoot(slot.workspacePath);
  const owned = isContainedIn(canonical, poolRoot);
  const head = filesystem === 'directory' ? await resolveCommit(canonical, 'HEAD') : null;
  const cleanlinessResult = filesystem === 'directory'
    ? await checkoutCleanliness(canonical)
    : null;
  const cleanliness: AppRuntimeWorktreeCleanupFingerprint['cleanliness'] = !cleanlinessResult
    ? 'not-applicable'
    : cleanlinessResult.status === 'unknown' ? 'unverifiable' : cleanlinessResult.status;
  const processResult = filesystem === 'directory'
    ? await processGuard.inspect(canonical)
    : { status: 'clear' as const, owned: 0 };
  const classified = classify(slot, {
    owned,
    canonicalMatches: canonical === slot.path,
    filesystem,
    registration,
    head,
    cleanliness,
    process: processResult.status,
  });
  const fingerprint: AppRuntimeWorktreeCleanupFingerprint = {
    repositoryId,
    slotId: slot.slotId,
    leaseId: slot.lease?.leaseId ?? null,
    slotState: slot.state,
    canonicalPath: canonical,
    workspacePath: slot.workspacePath,
    branchName: slot.branchName,
    branchKind: slot.branchKind,
    head,
    preparedHead: slot.preparedHead,
    resetTarget: slot.operation?.resetTarget ?? null,
    registration: {
      classification: registration.classification,
      head: registration.head,
      branchName: registration.branchName,
      detached: registration.detached,
      bare: registration.bare,
      locked: registration.locked,
      lockedReason: registration.lockedReason,
      prunable: registration.prunable,
      prunableReason: registration.prunableReason,
    },
    filesystem,
    cleanliness,
    process: processResult.status,
    classification: classified.classification,
  };
  return {
    slotId: slot.slotId,
    state: slot.state,
    holder: slot.lease?.leaseHolder ?? null,
    branchName: slot.branchName,
    branchKind: slot.branchKind,
    path: canonical,
    reason: classified.action.reason,
    action: classified.action,
    fingerprint,
  };
}

/** Reads state, Git, filesystem and process evidence without reconciling or writing it. */
export async function getWorktreePoolStatus(
  workspacePath: string,
  dependencies: CleanupInspectionDependencies = {},
): Promise<AppRuntimeWorktreePoolStatusResult> {
  const identity = await resolveRepositoryIdentity(workspacePath);
  if (identity.status !== 'ok') return unavailable(identity.reason);
  const [read, registrations] = await Promise.all([
    readPoolState(identity.identity.statePath, { preserveCorrupt: false }),
    listWorktreeRegistrations(workspacePath),
  ]);
  if (read.status === 'unavailable') return unavailable(read.reason);
  if (registrations.status !== 'ok') return unavailable(registrations.reason);
  const now = (dependencies.now ?? (() => new Date()))();
  const state = read.status === 'empty'
    ? emptyPoolState(identity.identity.repositoryId, now.toISOString())
    : read.state;
  if (state.repositoryId !== identity.identity.repositoryId) {
    return unavailable('The pool state belongs to a different repository identity.');
  }
  const processGuard = dependencies.processGuard ?? defaultWorktreeProcessGuard;
  const slots = await Promise.all(state.slots.map((slot) => inspectSlot(
    identity.identity.repositoryId,
    slot,
    registrations.records,
    registrations.nulDelimited,
    processGuard,
  )));
  const pool: AppRuntimeWorktreePoolStatus = {
    repositoryId: identity.identity.repositoryId,
    revision: state.revision,
    observedAt: now.toISOString(),
    slots,
  };
  return { status: 'ok', pool };
}

export function cleanupFingerprintsEqual(
  left: AppRuntimeWorktreeCleanupFingerprint,
  right: AppRuntimeWorktreeCleanupFingerprint,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
