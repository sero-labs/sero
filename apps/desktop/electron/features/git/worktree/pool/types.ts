/**
 * Persisted shape of one repository's worktree pool.
 *
 * Three sources of evidence exist for a checkout: this state file, Git's
 * worktree registration, and the directory on disk. They are independent, and
 * reuse requires all applicable evidence to agree. The state file is therefore
 * a record of intent and identity — never proof on its own.
 */

import type {
  AppRuntimeWorktreeBranchKind,
  AppRuntimeWorktreeDisposition,
  AppRuntimeWorktreeLease,
} from '@sero-ai/common';

/** Bumped whenever a persisted field changes. Unknown versions fail closed. */
export const POOL_SCHEMA_VERSION = 3;

/**
 * Stable states describe what a slot is. Transitional states describe an
 * operation that was in flight; each carries an operation record, so a crash
 * leaves evidence reconciliation can classify rather than an anonymous
 * reservation.
 */
export type SlotState =
  | 'available'
  | 'leased'
  | 'provisioning'
  | 'recycling'
  | 'removing'
  | 'dirty'
  | 'unmerged'
  | 'in-use'
  | 'damaged'
  | 'orphaned'
  | 'recovery-required';

export const TRANSITIONAL_STATES: readonly SlotState[] = ['provisioning', 'recycling', 'removing'];

export function isTransitional(state: SlotState): boolean {
  return TRANSITIONAL_STATES.includes(state);
}

export interface PoolOperation {
  operationId: string;
  /** Process that started the transition — evidence for crash reconciliation. */
  pid: number;
  startedAt: string;
  intendedState: SlotState;
  leaseId: string | null;
  /** Exact checkout target resolved before a recycling transition starts. */
  resetTarget: { ref: string; commit: string } | null;
}

/**
 * What a completed release did. Retained after the slot itself is gone, so a
 * retry of that release ("already-released") can be told apart from a delayed
 * release arriving after the slot was reassigned ("stale-lease").
 */
export interface ReleasedLeaseRecord {
  slotId: string;
  leaseId: string;
  disposition: AppRuntimeWorktreeDisposition;
  status: 'released' | 'preserved';
  at: string;
  reason: string;
}

/** How many completed releases are retained for idempotency answers. */
export const RELEASE_HISTORY_LIMIT = 64;

export interface PoolSlot {
  slotId: string;
  /** Canonical absolute path of the checkout. */
  path: string;
  /** Workspace registration that owns the physical directory. */
  workspacePath: string;
  state: SlotState;
  lease: AppRuntimeWorktreeLease | null;
  operation: PoolOperation | null;
  branchName: string | null;
  branchKind: AppRuntimeWorktreeBranchKind | null;
  /** HEAD proved after the last cache-preserving reset. */
  preparedHead: string | null;
  lastReleased: ReleasedLeaseRecord | null;
  /** Plain-English explanation of the current state. Never an empty string. */
  reason: string;
  /** Adopted from a pre-pool `card-*` checkout. */
  legacy: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PoolState {
  version: number;
  repositoryId: string;
  /** Monotonic; every committed write increments it. */
  revision: number;
  slots: PoolSlot[];
  /** Newest first, capped at RELEASE_HISTORY_LIMIT. */
  released: ReleasedLeaseRecord[];
  updatedAt: string;
}

export function emptyPoolState(repositoryId: string, now: string): PoolState {
  return {
    version: POOL_SCHEMA_VERSION,
    repositoryId,
    revision: 0,
    slots: [],
    released: [],
    updatedAt: now,
  };
}

export function recordRelease(state: PoolState, record: ReleasedLeaseRecord): PoolState {
  return {
    ...state,
    released: [record, ...state.released.filter((entry) => entry.leaseId !== record.leaseId)]
      .slice(0, RELEASE_HISTORY_LIMIT),
  };
}
