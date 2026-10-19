/**
 * Observable waits for a Goal: the agent parks the goal on something it can
 * see end, and the goal continues once, through its own loop, when that ends.
 *
 * A wait names a supported source kind and a stable source id. It never holds
 * a command, a predicate or free text to evaluate. The Goal's older
 * reason-only wait (`Goal.wait`) is untouched: it promises nothing and stays
 * manual. A goal saved before registered waits existed carries none.
 *
 * Every function returns the same goal object when nothing changed, so a
 * duplicate or late observation is visibly a no-op to the caller.
 */

import type { Goal } from './goal-types';

export const WAIT_SOURCE_KINDS = ['child', 'process', 'ci'] as const;
export type WaitSourceKind = (typeof WAIT_SOURCE_KINDS)[number];
export const WAIT_CONDITIONS = { child: 'completed', process: 'exited', ci: 'checks-concluded' } as const;
export type WaitCondition = (typeof WAIT_CONDITIONS)[WaitSourceKind];

/** The kinds the Goal runtime can observe today. A kind outside this list is refused. */
export const OBSERVABLE_SOURCES: readonly WaitSourceKind[] = ['child'];
export const MAX_DEADLINE_MINUTES = 7 * 24 * 60;

export type WaitOutcomeKind = 'satisfied' | 'failed' | 'expired' | 'cancelled' | 'uncertain';

export interface GoalWaitRegistration {
  id: string;
  owner: { goalId: string };
  source: { kind: WaitSourceKind; id: string };
  condition: WaitCondition;
  deadline: string | null;
  /** The goal's control revision when registered. A stop moves the goal past it. */
  controlRevision: number;
  registeredAt: string;
  /** Set once, by the first observation. */
  outcome: { kind: WaitOutcomeKind; at: string; detail?: string } | null;
  /** One wake per wait: reserved when the goal is woken, consumed when its turn starts. */
  wake: { reservedAt: string; consumedAt: string | null } | null;
}

export interface GoalWaitRequest {
  id: string;
  now: string;
  source: { kind: string; id: string };
  deadlineMinutes?: number;
}

export type GoalWaitResult =
  | { ok: true; goal: Goal; wait: GoalWaitRegistration; created: boolean }
  | { ok: false; reason: string };

export type GoalWakeResult = { ok: true; goal: Goal } | { ok: false; reason: string };

export const revisionOf = (goal: Goal): number => goal.controlRevision ?? 0;

export function manualResumeMessage(kind: string, id: string): string {
  return `Sero cannot monitor ${kind} "${id}" for this goal, so no wake is promised. Manual resume is required: call goal_wait with a reason only, or goal_blocked, and say what the user should check.`;
}

const isSourceKind = (kind: string): kind is WaitSourceKind => (WAIT_SOURCE_KINDS as readonly string[]).includes(kind);

export function registerWait(goal: Goal, request: GoalWaitRequest, supported: readonly WaitSourceKind[] = OBSERVABLE_SOURCES): GoalWaitResult {
  const { kind, id } = request.source;
  if (!isSourceKind(kind) || !supported.includes(kind) || !id.trim()) return { ok: false, reason: manualResumeMessage(kind, id) };
  const minutes = request.deadlineMinutes;
  if (minutes !== undefined && !(Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_DEADLINE_MINUTES)) {
    return { ok: false, reason: `deadlineMinutes must be between 1 and ${MAX_DEADLINE_MINUTES}.` };
  }
  const existing = goal.waits?.find((wait) => wait.outcome === null && wait.source.kind === kind && wait.source.id === id);
  if (existing) return { ok: true, goal, wait: existing, created: false };
  const wait: GoalWaitRegistration = {
    id: request.id,
    owner: { goalId: goal.id },
    source: { kind, id },
    condition: WAIT_CONDITIONS[kind],
    deadline: minutes === undefined ? null : new Date(Date.parse(request.now) + minutes * 60_000).toISOString(),
    controlRevision: revisionOf(goal),
    registeredAt: request.now,
    outcome: null,
    wake: null,
  };
  return { ok: true, goal: { ...goal, waits: [...(goal.waits ?? []), wait] }, wait, created: true };
}

const replace = (goal: Goal, next: GoalWaitRegistration): Goal => ({ ...goal, waits: (goal.waits ?? []).map((wait) => (wait.id === next.id ? next : wait)) });

export const openWaits = (goal: Goal): GoalWaitRegistration[] => (goal.waits ?? []).filter((wait) => wait.outcome === null);

/** Records what was observed. Only the first observation counts. */
export function observeWait(goal: Goal, waitId: string, kind: WaitOutcomeKind, now: string, detail?: string): Goal {
  const wait = goal.waits?.find((item) => item.id === waitId);
  if (!wait || wait.outcome !== null) return goal;
  return replace(goal, { ...wait, outcome: { kind, at: now, ...(detail ? { detail } : {}) } });
}

export function expireDueWaits(goal: Goal, now: string): Goal {
  return openWaits(goal).reduce((current, wait) => (wait.deadline !== null && wait.deadline <= now
    ? observeWait(current, wait.id, 'expired', now, `Its deadline passed at ${wait.deadline} with the condition unmet.`)
    : current), goal);
}

export function nextDeadline(goal: Goal): string | null {
  return openWaits(goal).map((wait) => wait.deadline).filter((at): at is string => at !== null).sort()[0] ?? null;
}

/** A stop is final: nothing registered before it can wake the goal, and resuming does not revive it. */
export function stopWaits(goal: Goal, now: string): Goal {
  const bumped: Goal = { ...goal, controlRevision: revisionOf(goal) + 1 };
  return openWaits(bumped).reduce((current, wait) => observeWait(current, wait.id, 'cancelled', now, 'The goal was stopped.'), bumped);
}

/**
 * The user resumed the goal themselves, so that resume is its one
 * continuation: open waits are cancelled, and an outcome that was waiting for
 * a resume is reserved for that continuation, which tells the agent what
 * ended. The same event cannot wake the goal a second time.
 */
export function supersedeWaits(goal: Goal, now: string): Goal {
  return (goal.waits ?? []).reduce((current, wait) => {
    if (wait.outcome === null) return observeWait(current, wait.id, 'cancelled', now, 'The user resumed the goal.');
    if (wait.wake === null && wait.outcome.kind !== 'cancelled' && wait.outcome.kind !== 'uncertain' && wait.controlRevision === revisionOf(goal)) {
      return replace(current, { ...wait, wake: { reservedAt: now, consumedAt: null } });
    }
    return current;
  }, goal);
}

const WAKING: readonly WaitOutcomeKind[] = ['satisfied', 'failed', 'expired'];
const fresh = (goal: Goal, wait: GoalWaitRegistration): boolean => wait.controlRevision === revisionOf(goal);

/** Reserves the wake for an ended wait. Only a waiting, unstopped goal, once per wait. */
export function reserveWake(goal: Goal, waitId: string, now: string): GoalWakeResult {
  const wait = goal.waits?.find((item) => item.id === waitId);
  if (!wait) return { ok: false, reason: `No wait "${waitId}".` };
  if (!wait.outcome || !WAKING.includes(wait.outcome.kind)) return { ok: false, reason: 'The wait has no outcome to wake for.' };
  if (wait.wake) return { ok: false, reason: 'The wake is already reserved.' };
  if (!fresh(goal, wait) || goal.closedAt) return { ok: false, reason: 'The goal was stopped after this wait was registered.' };
  if (goal.status !== 'waiting') return { ok: false, reason: `The goal is ${goal.status}, so it is not woken. The outcome stays on the record.` };
  return { ok: true, goal: replace(goal, { ...wait, wake: { reservedAt: now, consumedAt: null } }) };
}

/** Marks every reserved wake as started. A stale one is left alone. */
export function consumeWakes(goal: Goal, now: string): Goal {
  return (goal.waits ?? []).reduce((current, wait) => (wait.wake && wait.wake.consumedAt === null && fresh(goal, wait)
    ? replace(current, { ...wait, wake: { ...wait.wake, consumedAt: now } })
    : current), goal);
}

export const reservedWakes = (goal: Goal): GoalWaitRegistration[] =>
  (goal.waits ?? []).filter((wait) => wait.wake !== null && wait.wake.consumedAt === null && fresh(goal, wait));

export const unreservedMatches = (goal: Goal): GoalWaitRegistration[] =>
  (goal.waits ?? []).filter((wait) => wait.wake === null && wait.outcome !== null && WAKING.includes(wait.outcome.kind) && fresh(goal, wait));

/** What the continuation tells the agent about a wait that ended. Never says the work is complete. */
export function describeWait(wait: GoalWaitRegistration): string {
  const what = `${wait.source.kind} ${wait.source.id}`;
  const detail = wait.outcome?.detail ? ` ${wait.outcome.detail}` : '';
  switch (wait.outcome?.kind) {
    case 'satisfied': return `The wait on ${what} ended: its condition (${wait.condition}) was observed.${detail} Check the result before you rely on it.`;
    case 'failed': return `The wait on ${what} failed: the source ended without meeting its condition. This is not completion.${detail}`;
    case 'expired': return `The wait on ${what} expired before its condition was met. This is not completion.${detail}`;
    default: return `The wait on ${what} has no outcome yet.`;
  }
}
