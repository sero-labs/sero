/**
 * The host-owned worktree lease pool.
 *
 * Logical consumers — Workflow runs and Room members — hold immutable lease
 * identities; the host owns physical checkout allocation, proof and recovery.
 * See ./README.md for the invariants and the state machine.
 */

export { acquireWorktree } from './acquire';
export { reattachWorktree } from './reattach';
export { releaseWorktree } from './release';
export { getWorktreePoolStatus } from './cleanup-inspection';
export { createWorktreeCleanupPlan } from './cleanup-plans';
export { executeWorktreeCleanupPlan } from './cleanup-execute';
export { openPool } from './session';
export { POOL_SCHEMA_VERSION, type PoolSlot, type PoolState, type SlotState } from './types';
