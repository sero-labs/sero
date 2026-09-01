import { randomUUID } from 'node:crypto';

import type {
  AppRuntimeCreateWorktreeCleanupPlanResult,
  AppRuntimeWorktreeCleanupPlan,
  AppRuntimeWorktreePoolStatus,
} from '@sero-ai/common';

import {
  getWorktreePoolStatus,
  type CleanupInspectionDependencies,
} from './cleanup-inspection';
import { canonicalPath } from './repository';

export const DEFAULT_CLEANUP_PLAN_TTL_MS = 5 * 60_000;
const MAX_LIVE_PLANS = 32;

export interface StoredCleanupPlan {
  plan: AppRuntimeWorktreeCleanupPlan;
  workspacePath: string;
}

export type ConsumeCleanupPlanResult =
  | { status: 'ok'; stored: StoredCleanupPlan }
  | { status: 'unknown'; reason: string }
  | { status: 'expired'; reason: string };

/** Main-process-only confirmation state. Plans are never persisted or accepted from callers. */
export class CleanupPlanStore {
  private readonly plans = new Map<string, StoredCleanupPlan>();

  constructor(
    private readonly ttlMs = DEFAULT_CLEANUP_PLAN_TTL_MS,
    private readonly newId: () => string = randomUUID,
  ) {}

  issue(pool: AppRuntimeWorktreePoolStatus, workspacePath: string, now: Date): AppRuntimeWorktreeCleanupPlan {
    this.removeExpired(now);
    for (const [planId, stored] of this.plans) {
      if (stored.plan.repositoryId === pool.repositoryId) this.plans.delete(planId);
    }
    while (this.plans.size >= MAX_LIVE_PLANS) {
      const oldest = this.plans.keys().next().value as string | undefined;
      if (!oldest) break;
      this.plans.delete(oldest);
    }
    const plan: AppRuntimeWorktreeCleanupPlan = {
      planId: this.newId(),
      repositoryId: pool.repositoryId,
      poolRevision: pool.revision,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      slots: pool.slots,
    };
    this.plans.set(plan.planId, { plan, workspacePath });
    return plan;
  }

  /** Consumes before validation or execution, so every confirmation is one-shot. */
  consume(planId: string, now: Date): ConsumeCleanupPlanResult {
    const stored = this.plans.get(planId);
    if (!stored) return { status: 'unknown', reason: 'The cleanup plan is unknown or was already used.' };
    this.plans.delete(planId);
    if (Date.parse(stored.plan.expiresAt) <= now.getTime()) {
      return { status: 'expired', reason: 'The cleanup plan expired. Create and review a fresh plan.' };
    }
    return { status: 'ok', stored };
  }

  private removeExpired(now: Date): void {
    for (const [planId, stored] of this.plans) {
      if (Date.parse(stored.plan.expiresAt) <= now.getTime()) this.plans.delete(planId);
    }
  }
}

export const defaultCleanupPlanStore = new CleanupPlanStore();

export interface CreateCleanupPlanDependencies extends CleanupInspectionDependencies {
  plans?: CleanupPlanStore;
}

export async function createWorktreeCleanupPlan(
  workspacePath: string,
  dependencies: CreateCleanupPlanDependencies = {},
): Promise<AppRuntimeCreateWorktreeCleanupPlanResult> {
  const status = await getWorktreePoolStatus(workspacePath, dependencies);
  if (status.status !== 'ok') return status;
  const now = (dependencies.now ?? (() => new Date()))();
  const canonicalWorkspace = await canonicalPath(workspacePath);
  const plan = (dependencies.plans ?? defaultCleanupPlanStore)
    .issue(status.pool, canonicalWorkspace, now);
  return { status: 'planned', plan };
}
