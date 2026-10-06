/**
 * Goal supervision (D01: the extension drives, the runtime supervises).
 *
 * The runtime owns everything that happens OUTSIDE a turn — the durable record,
 * the budgets, the session-driver lock, restart recovery — and answers one
 * question per settled boundary: may this session continue itself now?
 *
 * The runtime is always present, so there is no second evaluator and no
 * degraded mode. When it cannot answer, the goal pauses rather than continuing
 * unsupervised.
 */

import type {
  Goal,
  GoalLimitKey,
  GoalLimitOrigin,
  GoalLimitOrigins,
  GoalLimits,
  GoalOutcome,
  GoalPauseReason,
  GoalTurnReport,
  GoalVerdict,
} from '../../shared/goal-types';
import type { OrchestratorState } from '../../shared/types';
import { DEFAULT_GOAL_LIMITS } from '../../shared/goal-defaults';
import type { OrchestratorHost } from '../host';
import { describeDriverConflict, type SessionDrivers } from '../session-drivers';
import { registerWait, stopWaits, supersedeWaits, type GoalWaitRequest } from '../../shared/goal-waits';
import { changeGoalLimits, checkGoalLimits } from './goal-limits';
import { GoalWaitWatcher } from './goal-wait-watcher';
import type { GoalStore } from './goal-store';
import {
  activate,
  block,
  isStalled,
  limit,
  pause,
  recordTurn,
  reportComplete,
  wait,
} from './goal-transitions';

export interface GoalStartRequest {
  sessionPath: string;
  objective: string;
  criteria: string[];
  limits?: GoalLimits;
  /** Who typed `limits`. Anything not typed is a default the agent may change. Absent means the user. */
  limitsBy?: GoalLimitOrigin;
}

/** Typed limits take the asker's origin; the built-in defaults belong to no user. */
function startingOrigins(request: GoalStartRequest): GoalLimitOrigins {
  const origins: GoalLimitOrigins = {};
  for (const key of Object.keys(DEFAULT_GOAL_LIMITS) as GoalLimitKey[]) origins[key] = 'agent';
  for (const key of Object.keys(request.limits ?? {}) as GoalLimitKey[]) origins[key] = request.limitsBy ?? 'user';
  return origins;
}

function failure(text: string): GoalOutcome {
  return { ok: false, text };
}

/** How long a goal has left, in words, for the one line a caller shows. */
function budgetSummary(goal: Goal): string {
  const cap = goal.limits.maxAttemptsTotal;
  return cap === undefined
    ? `${goal.usage.automaticTurns} automatic turn(s) used`
    : `${goal.usage.automaticTurns} of ${cap} automatic turns used`;
}

export class GoalRuntime {
  /** Observes registered waits and wakes the goal through its own loop. */
  readonly waits: GoalWaitWatcher;

  constructor(
    private readonly host: OrchestratorHost,
    private readonly store: GoalStore,
    private readonly drivers: SessionDrivers,
  ) {
    this.waits = new GoalWaitWatcher({ host, store, claim: (goalId, sessionPath) => this.claimSession(goalId, sessionPath), release: (goalId, sessionId) => this.drivers.release(sessionId, goalId) });
  }

  private ctx(): { now: string } {
    return { now: this.host.now() };
  }

  /**
   * Restart recovery. Limits are re-checked BEFORE anything resumes, so a goal
   * that exhausted its budget while Sero was closed comes back `limited` rather
   * than taking one more turn. A goal that was active stays active: its record
   * outlived the restart, and the session it drives re-attaches by path.
   */
  async reconcile(): Promise<void> {
    const nowMs = Date.parse(this.host.now());
    for (const goal of await this.store.list()) {
      if (goal.status !== 'active' && goal.status !== 'waiting') continue;
      // A held session id from the previous process means nothing now.
      const restored: Goal = { ...goal, sessionId: null };
      const check = checkGoalLimits(restored, nowMs);
      const next = check.ok
        ? restored
        : limit(restored, check.limit, `${check.reason} — checked on restart`, this.ctx());
      await this.store.put(next);
      if (!check.ok) this.host.log(`goal ${goal.id} is limited on restart: ${check.reason}`);
    }
    // A wait that ended while Sero was closed, or a wake reserved but never started.
    await this.waits.reconcile();
  }

  async list(): Promise<Goal[]> {
    return this.store.list();
  }

  async forSession(sessionPath: string): Promise<Goal | null> {
    return this.store.forSession(sessionPath);
  }

  /**
   * Takes the session for this goal, best effort. The host session id is only
   * resolvable when the workspace has an active session, and it is used for
   * nothing but arbitration — the extension drives delivery itself.
   */
  private async claimSession(goalId: string, sessionPath: string): Promise<{ sessionId: string | null } | { conflict: string }> {
    const active = await this.host.session.getActiveForWorkspace(this.host.workspaceId, sessionPath);
    if (!active) return { sessionId: null };
    const claim = this.drivers.claim(active.sessionId, { kind: 'goal', ownerId: goalId });
    if (!claim.ok) return { conflict: describeDriverConflict(claim.holder) };
    return { sessionId: active.sessionId };
  }

  private releaseSession(goal: Goal): void {
    if (goal.sessionId) this.drivers.release(goal.sessionId, goal.id);
  }

  /**
   * Gives the session back. Only an active goal may steer a session, so every
   * state that leaves `active` drops the claim — otherwise a paused, waiting or
   * limited goal keeps refusing a Workflow step it can no longer race. `resume`
   * re-takes the claim, and fails if something else took the session meanwhile.
   */
  private leaveActive(goal: Goal): Goal {
    this.releaseSession(goal);
    return { ...goal, sessionId: null };
  }

  async start(request: GoalStartRequest): Promise<GoalOutcome> {
    const objective = request.objective.trim();
    if (!objective) return failure('A goal needs an objective.');
    const existing = await this.store.forSession(request.sessionPath);
    if (existing) {
      return failure(
        `This session already has goal ${existing.id} (${existing.status}). Stop it before you start another.`,
      );
    }
    const id = this.host.newId('goal');
    const claimed = await this.claimSession(id, request.sessionPath);
    if ('conflict' in claimed) return failure(`Cannot start a goal here: ${claimed.conflict}.`);
    const now = this.host.now();
    const goal: Goal = {
      schemaVersion: 1,
      id,
      workspaceId: this.host.workspaceId,
      sessionPath: request.sessionPath,
      sessionId: claimed.sessionId,
      objective,
      criteria: request.criteria.map((criterion) => criterion.trim()).filter(Boolean),
      status: 'active',
      limits: { ...DEFAULT_GOAL_LIMITS, ...request.limits },
      limitOrigins: startingOrigins(request),
      usage: { automaticTurns: 0, totalTokens: 0, costUsd: 0, activeMs: 0 },
      progress: { repeats: 0 },
      activeSince: now,
      history: [{ at: now, from: 'active', to: 'active', reason: 'goal started' }],
      createdAt: now,
      updatedAt: now,
    };
    await this.store.put(goal);
    return { ok: true, text: `Goal ${id} is active — ${budgetSummary(goal)}.`, goal };
  }

  /**
   * Re-binds a restored goal to its session and re-takes the session lock. The
   * extension calls this at session start, after which the contract is
   * re-asserted from the record.
   *
   * A goal that cannot re-take the session is PAUSED here rather than returned
   * as active. The caller decides whether to drive from the status it gets
   * back, so a lost claim must change that status: otherwise a restored goal
   * would start steering a session a Workflow step already holds.
   */
  async reattach(sessionPath: string): Promise<Goal | null> {
    const goal = await this.store.forSession(sessionPath);
    if (!goal || goal.sessionId) return goal;
    const claimed = await this.claimSession(goal.id, goal.sessionPath);
    if ('conflict' in claimed) {
      if (goal.status !== 'active') return goal;
      const held = pause(goal, 'restore', `${claimed.conflict}, so the goal is on hold`, this.ctx());
      await this.store.put(held);
      this.host.log(`goal ${goal.id} is held on restore: ${claimed.conflict}`);
      return held;
    }
    // No active host session means no lock is available at all. The extension
    // still drives its own session; this is the documented best-effort case.
    if (claimed.sessionId === null) return goal;
    const next = { ...goal, sessionId: claimed.sessionId, updatedAt: this.host.now() };
    await this.store.put(next);
    return next;
  }

  /**
   * The settled-boundary decision. It charges the turn first — a turn that ran
   * is spent whatever the verdict — then answers with the state the goal is now
   * in. Everything but `continue` is already persisted when it returns.
   */
  async checkContinue(report: GoalTurnReport): Promise<GoalVerdict> {
    const goal = await this.store.get(report.goalId);
    if (!goal) return { kind: 'inactive', reason: 'this goal no longer exists' };
    if (goal.sessionPath !== report.sessionPath) {
      return { kind: 'inactive', goal, reason: 'this goal belongs to another session' };
    }
    if (goal.status !== 'active') {
      return { kind: 'inactive', goal, reason: `the goal is ${goal.status}` };
    }

    const charged = recordTurn(goal, report, this.ctx());
    const check = checkGoalLimits(charged, Date.parse(this.host.now()));
    if (!check.ok) {
      const next = limit(this.leaveActive(charged), check.limit, check.reason, this.ctx());
      await this.store.put(next);
      this.host.notify(`Goal reached a limit: ${check.reason}.`, 'warning', { openApp: true });
      return { kind: 'limited', goal: next, limit: check.limit, reason: check.reason };
    }
    if (report.automatic && !report.toolAttempted && isStalled(charged)) {
      const reason = 'the last turns produced the same result and attempted nothing';
      const next = pause(this.leaveActive(charged), 'no-progress', reason, this.ctx());
      await this.store.put(next);
      this.host.notify('A goal is holding: it is repeating itself.', 'warning', { openApp: true });
      return { kind: 'hold-no-progress', goal: next, reason };
    }
    await this.store.put(charged);
    return { kind: 'continue', goal: charged };
  }

  /**
   * Charges a settled turn to the goal that owned it, and moves nothing.
   *
   * A terminal tool changes the durable status DURING the turn, so by the time
   * that turn settles the goal can already be complete, blocked, waiting,
   * paused or stopped. The tokens were still spent. Charging them here keeps a
   * goal that resumes later from coming back with a budget that forgot its own
   * last turn. No transition and no limit check runs: the tool set the state,
   * and nothing may move a goal off the state its own report chose.
   */
  async recordSettledTurn(report: GoalTurnReport): Promise<Goal | null> {
    const goal = await this.store.get(report.goalId);
    if (!goal || goal.sessionPath !== report.sessionPath) return null;
    const charged = recordTurn(goal, report, this.ctx());
    await this.store.put(charged);
    return charged;
  }

  /**
   * Resolves a terminal report from the session that owns the goal. A call
   * carrying a stale goal id, or one made from a different session, is refused
   * instead of ending a goal it does not own.
   */
  private async owned(goalId: string, sessionPath: string): Promise<Goal | { error: string }> {
    const goal = await this.store.forSession(sessionPath);
    if (!goal) return { error: 'This session has no goal.' };
    if (goal.id !== goalId) {
      return { error: `Goal ${goalId} is not this session's goal (${goal.id}). It was replaced or cleared.` };
    }
    return goal;
  }

  async reportComplete(goalId: string, sessionPath: string, evidence: string): Promise<GoalOutcome> {
    const found = await this.owned(goalId, sessionPath);
    if ('error' in found) return failure(found.error);
    const next = reportComplete(this.leaveActive(found), evidence.trim(), this.ctx());
    await this.store.put(next);
    return {
      ok: true,
      // Phase 1 has no verification gate, so this is the agent's claim and the
      // wording must not promise more than that.
      text: `Goal ${goalId} is reported complete. The evidence is recorded for review.`,
      goal: next,
    };
  }

  async reportBlocked(goalId: string, sessionPath: string, reason: string, evidence?: string): Promise<GoalOutcome> {
    const found = await this.owned(goalId, sessionPath);
    if ('error' in found) return failure(found.error);
    const next = block(this.leaveActive(found), { reason: reason.trim(), evidence: evidence?.trim() }, this.ctx());
    await this.store.put(next);
    this.host.notify(`A goal is blocked: ${reason}`, 'warning', { openApp: true });
    return { ok: true, text: `Goal ${goalId} is blocked. The user must decide what happens next.`, goal: next };
  }

  /**
   * Parks the goal. With no registration this is the manual wait: the reason
   * is recorded, nothing wakes the goal, and the user resumes it. With one, the
   * goal waits on a source the runtime can read and continues by itself.
   */
  async reportWait(goalId: string, sessionPath: string, reason: string, request?: Omit<GoalWaitRequest, 'id' | 'now'>): Promise<GoalOutcome> {
    const found = await this.owned(goalId, sessionPath);
    if ('error' in found) return failure(found.error);
    if (request) return this.registerWait(found, reason.trim(), request);
    const next = wait(this.leaveActive(found), { reason: reason.trim() }, this.ctx());
    await this.store.put(next);
    return {
      ok: true,
      text: `Goal ${goalId} is waiting: ${reason}. Resume it with /goal resume when the condition is met.`,
      goal: next,
    };
  }

  /**
   * Parks the goal on a source the runtime can read. The intent is saved first,
   * then the source is read once, so a completion that landed just before this
   * call wakes the goal instead of being missed. A refusal parks nothing.
   */
  private async registerWait(goal: Goal, reason: string, request: Omit<GoalWaitRequest, 'id' | 'now'>): Promise<GoalOutcome> {
    const registered = registerWait(goal, { ...request, id: this.host.newId('wait'), now: this.host.now() });
    if (!registered.ok) return failure(registered.reason);
    if (request.source.kind === 'child' && !(await this.host.readState())?.loops.some((loop) => loop.id === request.source.id)) {
      return failure(`No Workflow "${request.source.id}" in this workspace to wait for.`);
    }
    const label = `${request.source.kind} ${request.source.id}`;
    const parked = wait(this.leaveActive(registered.goal), { reason: reason || `waiting for ${label}` }, this.ctx());
    await this.store.put(parked);
    await this.waits.reconcile(goal.id);
    const latest = (await this.store.get(goal.id)) ?? parked;
    return {
      ok: true,
      text: latest.status === 'active'
        ? `Goal ${goal.id}: ${label} had already ended. The goal continues after this turn.`
        : `Goal ${goal.id} is waiting for ${label}${registered.wait.deadline ? ` until ${registered.wait.deadline} at most` : ''}. It continues by itself when that ends, fails or its deadline passes; a failure is not completion.`,
      goal: latest,
    };
  }

  /** Marks the wait wakes on a goal as started. The Goal loop calls this as it starts the turn. */
  async consumeWakes(goalId: string): Promise<Goal | null> {
    return this.waits.consume(goalId);
  }

  /** The loop state was written: every open wait's source is read again. */
  async observeState(state: OrchestratorState): Promise<void> {
    await this.waits.reconcile(undefined, state);
  }

  dispose(): void {
    this.waits.dispose();
  }

  async pause(goalId: string, pauseReason: GoalPauseReason, reason: string): Promise<GoalOutcome> {
    // Read-modify-write on the freshest record, so a wake that lands first is paused, not overwritten.
    let changed = false;
    const goal = await this.store.update(goalId, (current) => {
      if (current.status === 'complete' || current.closedAt || current.status === 'paused') return current;
      changed = true;
      return pause(this.leaveActive(current), pauseReason, reason, this.ctx());
    });
    if (!goal) return failure(`No goal ${goalId}.`);
    if (goal.status === 'complete' || goal.closedAt) return failure(`Goal ${goalId} is finished.`);
    if (!changed) return { ok: true, text: `Goal ${goalId} is already paused.`, goal };
    return { ok: true, text: `Goal ${goalId} is paused: ${reason}`, goal };
  }

  /**
   * Restarts an interrupted goal. Budgets are re-checked first, so a goal the
   * user resumes after raising nothing comes straight back to `limited` with
   * the reason rather than taking one more turn.
   */
  async resume(goalId: string): Promise<GoalOutcome> {
    const goal = await this.store.get(goalId);
    if (!goal) return failure(`No goal ${goalId}.`);
    if (goal.status === 'complete' || goal.closedAt) return failure(`Goal ${goalId} is finished.`);
    if (goal.status === 'active') return { ok: true, text: `Goal ${goalId} is already active.`, goal };
    const check = checkGoalLimits(goal, Date.parse(this.host.now()));
    if (!check.ok) {
      const next = limit(goal, check.limit, check.reason, this.ctx());
      await this.store.put(next);
      return failure(`Goal ${goalId} cannot resume: it ${check.reason}. Raise that limit first.`);
    }
    const claimed = await this.claimSession(goal.id, goal.sessionPath);
    if ('conflict' in claimed) return failure(`Cannot resume the goal: ${claimed.conflict}.`);
    const next = activate({ ...supersedeWaits(goal, this.host.now()), sessionId: claimed.sessionId }, 'the user resumed the goal', this.ctx());
    await this.store.put(next);
    return { ok: true, text: `Goal ${goalId} is active again — ${budgetSummary(next)}.`, goal: next };
  }

  /** Ends the goal without claiming it was met. The record and its history stay. */
  async stop(goalId: string): Promise<GoalOutcome> {
    let changed = false;
    const goal = await this.store.update(goalId, (current) => {
      if (current.status === 'complete' || current.closedAt) return current;
      changed = true;
      return { ...pause(this.leaveActive(stopWaits(current, this.host.now())), 'user', 'the user stopped the goal', this.ctx()), closedAt: this.host.now() };
    });
    if (!goal) return failure(`No goal ${goalId}.`);
    if (!changed) return { ok: true, text: `Goal ${goalId} is already finished.`, goal };
    return { ok: true, text: `Goal ${goalId} is stopped.`, goal };
  }

  /** Permanently removes a finished Goal record and its watched-index entry. */
  async remove(goalId: string): Promise<GoalOutcome> {
    const goal = await this.store.get(goalId);
    if (!goal) return failure(`No goal ${goalId}.`);
    if (goal.status !== 'complete' && !goal.closedAt) {
      return failure(`Goal ${goalId} is still live. Stop it before deleting it.`);
    }
    await this.store.remove(goalId);
    return { ok: true, text: `Goal ${goalId} was deleted.` };
  }

  /** Raises or lowers a budget on a goal the user wants to keep going. */
  /** `by` says who is asking: an agent cannot raise or remove a limit the user set. */
  async setLimits(goalId: string, limits: GoalLimits, by: GoalLimitOrigin): Promise<GoalOutcome> {
    const goal = await this.store.get(goalId);
    if (!goal) return failure(`No goal ${goalId}.`);
    const change = changeGoalLimits(goal, limits, by);
    if (!change.ok) return failure(change.reason);
    const next = { ...goal, limits: change.limits, limitOrigins: change.origins, updatedAt: this.host.now() };
    await this.store.put(next);
    return { ok: true, text: `Goal ${goalId} budgets updated — ${budgetSummary(next)}.`, goal: next };
  }
}
