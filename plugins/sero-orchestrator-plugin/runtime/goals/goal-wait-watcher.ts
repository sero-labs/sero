/**
 * Observes a Goal's registered waits and wakes the goal once when one ends.
 *
 * A reconcile runs because something happened: the loop state was written, a
 * dev server changed, the runtime started, a wait was registered, or one timer
 * armed for a deadline fired. Each one re-reads the durable state of the
 * source, so a notification is only a hint to look. The one repeated read is
 * the CI source: while a waiting goal has an open CI wait, its checks are read
 * again every two minutes. A read never starts a turn; only an ended wait does.
 *
 * Waking goes through the same checks as the user's resume: the limits, and
 * the one-driver-per-session claim. It sets the goal active and signals the
 * Goal loop, which starts the turn under its usual supervision.
 */

import { CI_WAIT_READ_INTERVAL_MS, ciWaitOutcome, ciWaitRefusal, processWaitOutcome, processWaitRefusal, type AppRuntimeDevServer, type AppRuntimeRefChecks } from '@sero-ai/common';
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
  type GoalWaitRegistration,
  type WaitSourceKind,
} from '../../shared/goal-waits';
import type { OrchestratorState } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { checkGoalLimits } from './goal-limits';
import type { GoalStore } from './goal-store';
import { activate, block, limit } from './goal-transitions';
import { notifyGoalWake } from './goal-wake';

type Claim = { sessionId: string | null } | { conflict: string };

export interface GoalWaitWatcherDeps {
  host: Pick<OrchestratorHost, 'now' | 'log' | 'readState' | 'listDevServers' | 'onDevServerChange' | 'refChecks'>;
  store: GoalStore;
  claim(goalId: string, sessionPath: string): Promise<Claim>;
  /** Gives back a claim taken for a wake that did not commit. */
  release(goalId: string, sessionId: string): void;
}

/** How a Workflow ended, or null while it has not. A state that lacks it means it is gone. */
function childOutcome(loopId: string, state: OrchestratorState): { kind: 'satisfied' | 'failed'; detail: string } | null {
  const loop = state.loops.find((item) => item.id === loopId);
  if (!loop) return { kind: 'failed', detail: 'The Workflow no longer exists.' };
  if (loop.status === 'complete') return { kind: 'satisfied', detail: 'The Workflow reported completion. That is a claim.' };
  if (loop.status === 'blocked') return { kind: 'failed', detail: 'The Workflow is blocked.' };
  return null;
}

/** What the host showed of the dev servers and CI refs the open waits name. Absent means not read. */
interface ExternalReads {
  servers: AppRuntimeDevServer[] | null;
  checks: Map<string, AppRuntimeRefChecks>;
}

const NO_READS: ExternalReads = { servers: null, checks: new Map() };

function externalOutcome(wait: GoalWaitRegistration, reads: ExternalReads): { kind: 'satisfied' | 'failed' | 'uncertain'; detail: string } | null {
  if (wait.source.kind === 'process') {
    return reads.servers ? processWaitOutcome(wait.source.id, reads.servers.find((server) => server.id === wait.source.id)) : null;
  }
  const checks = wait.source.kind === 'ci' ? reads.checks.get(wait.source.id) : undefined;
  return checks ? ciWaitOutcome(wait.source.id, checks) : null;
}

export class GoalWaitWatcher {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ciTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private tail: Promise<unknown> = Promise.resolve();
  private readonly stopFollow: (() => void) | undefined;

  constructor(private readonly deps: GoalWaitWatcherDeps) {
    this.stopFollow = deps.host.onDevServerChange?.(() => { void this.reconcile(); });
  }

  /** Why a process or CI wait on this source could never end here, or null when it can be registered. */
  async admit(kind: WaitSourceKind, id: string): Promise<string | null> {
    const { host } = this.deps;
    if (kind === 'process') {
      if (!host.listDevServers) return 'This workspace cannot report its dev servers, so a goal cannot wait on one.';
      return processWaitRefusal(id, host.listDevServers().find((server) => server.id === id));
    }
    if (kind !== 'ci') return null;
    if (!host.refChecks) return 'This workspace cannot read CI checks, so a goal cannot wait on them.';
    return ciWaitRefusal(id, await host.refChecks(id));
  }

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
    this.stopFollow?.();
    for (const timer of [...this.timers.values(), ...this.ciTimers.values()]) clearTimeout(timer);
    this.timers.clear();
    this.ciTimers.clear();
  }

  /** Reads the dev servers and CI refs the goal's open waits name, before the queued write. */
  private async readExternal(goal: Goal): Promise<ExternalReads> {
    const { host } = this.deps;
    const open = openWaits(goal);
    const servers = host.listDevServers && open.some((wait) => wait.source.kind === 'process') ? host.listDevServers() : null;
    const checks = new Map<string, AppRuntimeRefChecks>();
    for (const ref of new Set(open.filter((wait) => wait.source.kind === 'ci').map((wait) => wait.source.id))) {
      const read = host.refChecks ? await host.refChecks(ref) : null;
      // A failed read observes nothing: the wait stays open and is read again.
      if (read && read.state !== 'unknown') checks.set(ref, read);
      else host.log(`goal ${goal.id}: could not read the CI checks of ${ref}${read?.reason ? `: ${read.reason}` : ''}`);
    }
    return { servers, checks };
  }

  private async run(goalId: string | undefined, given: OrchestratorState | null | undefined): Promise<void> {
    const goals = goalId ? [await this.deps.store.get(goalId)] : await this.deps.store.list();
    const targets = goals.filter((goal): goal is Goal => goal !== null && !goal.closedAt
      && (openWaits(goal).length > 0 || unreservedMatches(goal).length > 0));
    if (targets.length === 0) return;
    const state = given ?? await this.deps.host.readState();
    for (const goal of targets) await this.settle(goal.id, state, await this.readExternal(goal));
  }

  /** The waits' outcomes as the sources show them now. Pure: nothing is saved here. */
  private observe(goal: Goal, state: OrchestratorState | null, external: ExternalReads, now: string): Goal {
    let next = goal;
    for (const wait of openWaits(goal)) {
      const seen = wait.source.kind === 'child' ? (state ? childOutcome(wait.source.id, state) : null) : externalOutcome(wait, external);
      if (!seen) continue;
      next = observeWait(next, wait.id, seen.kind, now, seen.detail);
      // An outcome nobody can confirm blocks the goal for the user; it is never taken as success.
      if (seen.kind === 'uncertain' && next.status === 'waiting') {
        next = block(next, { reason: `could not confirm the outcome of ${wait.source.kind} ${wait.source.id}: ${seen.detail}` }, { now });
      }
    }
    return expireDueWaits(next, now);
  }

  /**
   * One goal. The decision and its save are one read-modify-write on the
   * freshest record, so a pause or stop that lands while the session claim is
   * awaited is never undone: a goal that is no longer waiting is left alone.
   */
  private async settle(goalId: string, state: OrchestratorState | null, external: ExternalReads = NO_READS): Promise<void> {
    const { host, store } = this.deps;
    const now = host.now();
    let claimed: { sessionId: string | null } | null = null;
    const woke = { goal: null as Goal | null };
    let final: Goal | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let needsClaim = false;
      woke.goal = null;
      final = await store.update(goalId, (current) => {
        if (current.closedAt) return current;
        const next = this.observe(current, state, external, now);
        if (unreservedMatches(next).length === 0 || next.status !== 'waiting') return next === current ? current : next;
        const check = checkGoalLimits(next, Date.parse(now));
        if (!check.ok) return limit(next, check.limit, `${check.reason} — a wait ended, and a limit is not lifted by waiting`, { now });
        if (!claimed) {
          needsClaim = true;
          return next === current ? current : next;
        }
        woke.goal = this.wake(next, claimed, now);
        return woke.goal;
      });
      if (!needsClaim || !final) break;
      const result = await this.deps.claim(goalId, final.sessionPath);
      if ('conflict' in result) {
        host.log(`goal ${goalId}: a wait ended but ${result.conflict}, so the goal stays waiting`);
        break;
      }
      claimed = result;
    }
    // A claim taken for a wake that did not commit would hold the session for nothing. A claim is
    // one slot per session, not a count, so it is given back only when the freshest record shows
    // the goal is not active on it: an active goal (this wake, or a resume that won the race)
    // relies on that slot, and a later stop or pause releases it.
    const taken = claimed?.sessionId;
    // Whether the wake is still the goal's state when the notification would go out: a stop that
    // queued ahead of this read leaves the goal stopped, and nothing may start another turn.
    let wakeStands = false;
    if (claimed) {
      let ran = false;
      final = await store.update(goalId, (current) => {
        ran = true;
        const active = current.status === 'active' && current.sessionId === claimed.sessionId;
        wakeStands = active && reservedWakes(current).length > 0;
        if (taken && !active) this.deps.release(goalId, taken);
        return current;
      }) ?? final;
      // The goal was deleted while the claim was awaited: nothing is left to hold the session.
      if (!ran && taken) this.deps.release(goalId, taken);
    }
    if (!final) return;
    this.arm(final);
    if (woke.goal?.status === 'active' && wakeStands) notifyGoalWake(woke.goal);
  }

  /** The same gates as the user's resume, the limits and the session claim, already passed. */
  private wake(goal: Goal, claimed: { sessionId: string | null }, now: string): Goal {
    let next = goal;
    for (const wait of unreservedMatches(goal)) {
      const reserved = reserveWake(next, wait.id, now);
      if (reserved.ok) next = reserved.goal;
    }
    const lines = reservedWakes(next).map(describeWait).join(' ');
    return activate({ ...next, sessionId: claimed.sessionId }, `a registered wait ended. ${lines}`, { now });
  }

  private arm(goal: Goal): void {
    clearTimeout(this.ciTimers.get(goal.id));
    this.ciTimers.delete(goal.id);
    if (goal.status === 'waiting' && openWaits(goal).some((wait) => wait.source.kind === 'ci')) {
      const read = setTimeout(() => { void this.reconcile(goal.id); }, CI_WAIT_READ_INTERVAL_MS);
      read.unref?.();
      this.ciTimers.set(goal.id, read);
    }
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
