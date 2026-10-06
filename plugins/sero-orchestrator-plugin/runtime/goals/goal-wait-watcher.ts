/**
 * Observes a Goal's registered waits and wakes the goal once when one ends.
 *
 * Nothing polls. A reconcile runs because something happened: the loop state
 * was written, the runtime started, a wait was registered, or one timer armed
 * for a deadline fired. Each one re-reads the durable state of the source, so a
 * notification is only a hint to look.
 *
 * Waking goes through the same checks as the user's resume: the limits, and
 * the one-driver-per-session claim. It sets the goal active and signals the
 * Goal loop, which starts the turn under its usual supervision.
 */

import type { Goal } from '../../shared/goal-types';
import {
  consumeWakes,
  describeWait,
  expireDueWaits,
  nextDeadline,
  observeWait,
  openWaits,
  reservedWakes,
  reserveWake,
  unreservedMatches,
} from '../../shared/goal-waits';
import type { OrchestratorState } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { checkGoalLimits } from './goal-limits';
import type { GoalStore } from './goal-store';
import { activate, limit } from './goal-transitions';
import { notifyGoalWake } from './goal-wake';

type Claim = { sessionId: string | null } | { conflict: string };

export interface GoalWaitWatcherDeps {
  host: Pick<OrchestratorHost, 'now' | 'log' | 'readState'>;
  store: GoalStore;
  claim(goalId: string, sessionPath: string): Promise<Claim>;
}

/** How a Workflow ended, or null while it has not. A state that lacks it means it is gone. */
function childOutcome(loopId: string, state: OrchestratorState): { kind: 'satisfied' | 'failed'; detail: string } | null {
  const loop = state.loops.find((item) => item.id === loopId);
  if (!loop) return { kind: 'failed', detail: 'The Workflow no longer exists.' };
  if (loop.status === 'complete') return { kind: 'satisfied', detail: 'The Workflow reported completion. That is a claim.' };
  if (loop.status === 'blocked') return { kind: 'failed', detail: 'The Workflow is blocked.' };
  return null;
}

export class GoalWaitWatcher {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: GoalWaitWatcherDeps) {}

  /** Reconciles one goal, or every goal with an open wait or an unreserved outcome. */
  reconcile(goalId?: string, given?: OrchestratorState | null): Promise<void> {
    const run = this.tail.then(() => this.run(goalId, given));
    this.tail = run.catch((error: unknown) => this.deps.host.log(`could not reconcile goal waits: ${error instanceof Error ? error.message : String(error)}`));
    return run.catch(() => undefined);
  }

  /** Marks the wakes reserved on a goal as started. */
  async consume(goalId: string): Promise<Goal | null> {
    const goal = await this.deps.store.get(goalId);
    if (!goal || reservedWakes(goal).length === 0) return goal;
    const next = consumeWakes(goal, this.deps.host.now());
    await this.deps.store.put(next);
    return next;
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async run(goalId: string | undefined, given: OrchestratorState | null | undefined): Promise<void> {
    const goals = goalId ? [await this.deps.store.get(goalId)] : await this.deps.store.list();
    const targets = goals.filter((goal): goal is Goal => goal !== null && !goal.closedAt
      && (openWaits(goal).length > 0 || unreservedMatches(goal).length > 0));
    if (targets.length === 0) return;
    const state = given ?? await this.deps.host.readState();
    for (const goal of targets) await this.settle(goal.id, state);
  }

  private async settle(goalId: string, state: OrchestratorState | null): Promise<void> {
    const { host, store } = this.deps;
    const now = host.now();
    const start = await store.get(goalId);
    if (!start) return;
    let next = start;
    for (const wait of openWaits(start)) {
      const seen = state && wait.source.kind === 'child' ? childOutcome(wait.source.id, state) : null;
      if (seen) next = observeWait(next, wait.id, seen.kind, now, seen.detail);
    }
    next = expireDueWaits(next, now);
    const waking = unreservedMatches(next).length > 0 && next.status === 'waiting';
    let activated: Goal | null = null;
    if (waking) activated = await this.wake(next, now);
    const final = activated ?? next;
    if (final !== start) await store.put(final);
    this.arm(final);
    if (activated?.status === 'active') notifyGoalWake(activated);
  }

  /** The same gates as the user's resume. Null leaves the goal waiting, its outcome kept. */
  private async wake(goal: Goal, now: string): Promise<Goal | null> {
    const ctx = { now };
    const check = checkGoalLimits(goal, Date.parse(now));
    if (!check.ok) return limit(goal, check.limit, `${check.reason} — a wait ended, and a limit is not lifted by waiting`, ctx);
    const claimed = await this.deps.claim(goal.id, goal.sessionPath);
    if ('conflict' in claimed) {
      this.deps.host.log(`goal ${goal.id}: a wait ended but ${claimed.conflict}, so the goal stays waiting`);
      return null;
    }
    let next = goal;
    for (const wait of unreservedMatches(goal)) {
      const reserved = reserveWake(next, wait.id, now);
      if (reserved.ok) next = reserved.goal;
    }
    const lines = reservedWakes(next).map(describeWait).join(' ');
    return activate({ ...next, sessionId: claimed.sessionId }, `a registered wait ended. ${lines}`, ctx);
  }

  private arm(goal: Goal): void {
    clearTimeout(this.timers.get(goal.id));
    this.timers.delete(goal.id);
    const deadline = nextDeadline(goal);
    if (!deadline || goal.status !== 'waiting') return;
    // One timer to the earliest deadline, not a poll.
    const timer = setTimeout(() => { void this.reconcile(goal.id); }, Math.max(0, Date.parse(deadline) - Date.parse(this.deps.host.now())));
    timer.unref?.();
    this.timers.set(goal.id, timer);
  }
}
