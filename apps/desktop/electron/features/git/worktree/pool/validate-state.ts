/**
 * Field-by-field validation of persisted pool state.
 *
 * A truncated write can still parse as JSON — `{"version":1,"slots":[]}` is a
 * valid document and a catastrophic lie about a repository that holds work.
 * Every field is therefore checked, and one wrong field rejects the whole
 * file rather than leaving a partly trusted record.
 *
 * Field shapes alone are not enough. A slot and the lease inside it each
 * carry an id, a path and a branch, and a file where those disagree is
 * syntactically perfect and semantically a lie: reattachment hands the
 * consumer the LEASE's path, while reconciliation proved the SLOT's, so a
 * doctored or half-written record could route work to a directory Git never
 * vouched for. The relationships between records are therefore validated as
 * strictly as the records themselves.
 */

import type {
  AppRuntimeWorktreeBranchKind,
  AppRuntimeWorktreeLease,
} from '@sero-ai/common';

import type { PoolOperation, PoolSlot, PoolState, ReleasedLeaseRecord, SlotState } from './types';

export type PoolStateValidation =
  | { status: 'valid'; state: PoolState }
  | { status: 'invalid'; reason: string };

const SLOT_STATES: readonly string[] = [
  'available', 'leased', 'provisioning', 'recycling', 'removing',
  'dirty', 'unmerged', 'in-use', 'damaged', 'orphaned', 'recovery-required',
];
const BRANCH_KINDS: readonly string[] = ['fresh-task', 'external-pr'];
const RELEASE_STATUSES: readonly string[] = ['released', 'preserved'];

type Record_ = Record<string, unknown>;

function asRecord(value: unknown): Record_ | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record_)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableStr(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null) return { ok: true, value: null };
  const text = str(value);
  return text === null ? { ok: false } : { ok: true, value: text };
}

function parseLease(value: unknown): AppRuntimeWorktreeLease | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const slotId = str(raw.slotId);
  const leaseId = str(raw.leaseId);
  const leaseHolder = str(raw.leaseHolder);
  const worktreePath = str(raw.worktreePath);
  const branchName = str(raw.branchName);
  const acquiredAt = str(raw.acquiredAt);
  const branchKind = str(raw.branchKind);
  if (!slotId || !leaseId || !leaseHolder || !worktreePath || !branchName || !acquiredAt) return null;
  if (!branchKind || !BRANCH_KINDS.includes(branchKind)) return null;
  const baseRef = nullableStr(raw.baseRef);
  const baseCommit = nullableStr(raw.baseCommit);
  const acquiredHead = nullableStr(raw.acquiredHead);
  if (!baseRef.ok || !baseCommit.ok || !acquiredHead.ok) return null;
  if (typeof raw.greenfield !== 'boolean') return null;
  return {
    slotId,
    leaseId,
    leaseHolder,
    worktreePath,
    branchName,
    branchKind: branchKind as AppRuntimeWorktreeBranchKind,
    baseRef: baseRef.value,
    baseCommit: baseCommit.value,
    acquiredHead: acquiredHead.value,
    acquiredAt,
    greenfield: raw.greenfield,
  };
}

function parseOperation(value: unknown): PoolOperation | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const operationId = str(raw.operationId);
  const startedAt = str(raw.startedAt);
  const intendedState = str(raw.intendedState);
  const leaseId = nullableStr(raw.leaseId);
  if (!operationId || !startedAt || !intendedState || !leaseId.ok) return null;
  if (!SLOT_STATES.includes(intendedState)) return null;
  if (typeof raw.pid !== 'number' || !Number.isInteger(raw.pid)) return null;
  return {
    operationId,
    pid: raw.pid,
    startedAt,
    intendedState: intendedState as SlotState,
    leaseId: leaseId.value,
  };
}

function parseReleased(value: unknown): ReleasedLeaseRecord | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const slotId = str(raw.slotId);
  const leaseId = str(raw.leaseId);
  const status = str(raw.status);
  const disposition = str(raw.disposition);
  const at = str(raw.at);
  const reason = str(raw.reason);
  if (!slotId || !leaseId || !at || !reason || !status || !RELEASE_STATUSES.includes(status)) return null;
  if (!disposition || !['recycle', 'preserve', 'remove'].includes(disposition)) return null;
  return {
    slotId,
    leaseId,
    disposition: disposition as ReleasedLeaseRecord['disposition'],
    status: status as ReleasedLeaseRecord['status'],
    at,
    reason,
  };
}

function parseSlot(value: unknown): PoolSlot | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const slotId = str(raw.slotId);
  const slotPath = str(raw.path);
  const workspacePath = str(raw.workspacePath);
  const state = str(raw.state);
  const reason = str(raw.reason);
  const createdAt = str(raw.createdAt);
  const updatedAt = str(raw.updatedAt);
  if (!slotId || !slotPath || !workspacePath || !reason || !createdAt || !updatedAt) return null;
  if (!state || !SLOT_STATES.includes(state)) return null;
  if (typeof raw.legacy !== 'boolean') return null;

  const branchName = nullableStr(raw.branchName);
  if (!branchName.ok) return null;
  const branchKindRaw = nullableStr(raw.branchKind);
  if (!branchKindRaw.ok) return null;
  if (branchKindRaw.value !== null && !BRANCH_KINDS.includes(branchKindRaw.value)) return null;

  const lease = raw.lease === null ? null : parseLease(raw.lease);
  if (raw.lease !== null && lease === null) return null;
  const operation = raw.operation === null ? null : parseOperation(raw.operation);
  if (raw.operation !== null && operation === null) return null;
  const lastReleased = raw.lastReleased === null ? null : parseReleased(raw.lastReleased);
  if (raw.lastReleased !== null && lastReleased === null) return null;

  return {
    slotId,
    path: slotPath,
    workspacePath,
    state: state as SlotState,
    lease,
    operation,
    branchName: branchName.value,
    branchKind: branchKindRaw.value as AppRuntimeWorktreeBranchKind | null,
    lastReleased,
    reason,
    legacy: raw.legacy,
    createdAt,
    updatedAt,
  };
}

/** Relationships a slot must satisfy internally, beyond each field's own shape. */
function slotDisagreement(slot: PoolSlot): string | null {
  const { lease } = slot;
  if (slot.state === 'leased' && !lease) return `slot ${slot.slotId} is leased but holds no lease`;
  if (lease) {
    if (lease.slotId !== slot.slotId) return `lease ${lease.leaseId} names slot ${lease.slotId}, not ${slot.slotId}`;
    if (lease.worktreePath !== slot.path) return `lease ${lease.leaseId} names a different path from slot ${slot.slotId}`;
    if (slot.branchName !== null && slot.branchName !== lease.branchName) {
      return `slot ${slot.slotId} and its lease disagree about the branch`;
    }
    if (slot.branchKind !== null && slot.branchKind !== lease.branchKind) {
      return `slot ${slot.slotId} and its lease disagree about the branch kind`;
    }
  }
  if (slot.operation?.leaseId != null && slot.operation.leaseId !== lease?.leaseId) {
    return `slot ${slot.slotId} records an operation for a lease it does not hold`;
  }
  if (slot.lastReleased && slot.lastReleased.slotId !== slot.slotId) {
    return `slot ${slot.slotId} records a release belonging to slot ${slot.lastReleased.slotId}`;
  }
  return null;
}

/** Relationships that must hold ACROSS slots. */
function poolDisagreement(slots: PoolSlot[]): string | null {
  const paths = new Set<string>();
  const leaseIds = new Set<string>();
  for (const slot of slots) {
    if (paths.has(slot.path)) return `two slots claim the path ${slot.path}`;
    paths.add(slot.path);
    if (!slot.lease) continue;
    if (leaseIds.has(slot.lease.leaseId)) return `lease ${slot.lease.leaseId} is held by two slots`;
    leaseIds.add(slot.lease.leaseId);
  }
  return null;
}

export function validatePoolState(value: unknown): PoolStateValidation {
  const raw = asRecord(value);
  if (!raw) return { status: 'invalid', reason: 'Pool state is not an object.' };
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version)) {
    return { status: 'invalid', reason: 'Pool state has no integer schema version.' };
  }
  const repositoryId = str(raw.repositoryId);
  const updatedAt = str(raw.updatedAt);
  if (!repositoryId) return { status: 'invalid', reason: 'Pool state has no repository identity.' };
  if (!updatedAt) return { status: 'invalid', reason: 'Pool state has no update time.' };
  if (typeof raw.revision !== 'number' || !Number.isInteger(raw.revision) || raw.revision < 0) {
    return { status: 'invalid', reason: 'Pool state has no valid revision.' };
  }
  if (!Array.isArray(raw.slots)) return { status: 'invalid', reason: 'Pool state has no slot list.' };
  if (!Array.isArray(raw.released)) return { status: 'invalid', reason: 'Pool state has no release history.' };

  const released: ReleasedLeaseRecord[] = [];
  for (const entry of raw.released) {
    const record = parseReleased(entry);
    if (!record) return { status: 'invalid', reason: 'Pool state contains an unreadable release record.' };
    released.push(record);
  }

  const slots: PoolSlot[] = [];
  for (const entry of raw.slots) {
    const slot = parseSlot(entry);
    if (!slot) return { status: 'invalid', reason: 'Pool state contains an unreadable slot record.' };
    if (slots.some((existing) => existing.slotId === slot.slotId)) {
      return { status: 'invalid', reason: `Pool state repeats slot ${slot.slotId}.` };
    }
    const disagreement = slotDisagreement(slot);
    if (disagreement) return { status: 'invalid', reason: `Pool state disagrees with itself: ${disagreement}.` };
    slots.push(slot);
  }
  const across = poolDisagreement(slots);
  if (across) return { status: 'invalid', reason: `Pool state disagrees with itself: ${across}.` };
  return {
    status: 'valid',
    state: { version: raw.version, repositoryId, revision: raw.revision, slots, released, updatedAt },
  };
}
