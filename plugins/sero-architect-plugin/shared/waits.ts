/**
 * Observable waits: the owner ends a wake by naming something it can see end,
 * and is woken once when that happens.
 *
 * A wait names a supported source kind and a stable source id. It never holds
 * a command, a predicate or free text to evaluate: the runtime reads the
 * source's own durable state and decides. The record keeps the wait, what was
 * observed, and one wake marker, so a restart can tell a wake that was never
 * sent from one that was.
 *
 * Every function here returns the same record object when nothing changed, so
 * a duplicate or late observation is visibly a no-op to the caller.
 *
 * Records saved before waits existed carry none, and none is invented on load.
 */

import { agreementApproved, hasAgreement } from './agreement';
import { mayWakeForWork } from './lifecycle';
import type { ProjectRecord } from './record';

export const WAIT_SOURCE_KINDS = ['child', 'process', 'ci'] as const;
export type WaitSourceKind = (typeof WAIT_SOURCE_KINDS)[number];

/** What each kind waits for. A closed set: nothing else can be registered. */
export const WAIT_CONDITIONS = { child: 'completed', process: 'exited', ci: 'checks-concluded' } as const;
export type WaitCondition = (typeof WAIT_CONDITIONS)[WaitSourceKind];

/** The kinds the runtime can observe today. A kind outside this list is refused. */
export const OBSERVABLE_SOURCES: readonly WaitSourceKind[] = ['child'];

/** The longest deadline, kept under what one timer can hold. */
export const MAX_DEADLINE_MINUTES = 7 * 24 * 60;

export type WaitOutcomeKind = 'satisfied' | 'failed' | 'expired' | 'cancelled' | 'uncertain';

export interface WaitRegistration {
  id: string;
  /**
   * Who waits: a milestone and its direct execution when it has one, or a
   * research entry (milestone null) the owner started.
   */
  owner: { milestoneId: string | null; researchId?: string; executionId: string | null };
  source: { kind: WaitSourceKind; id: string };
  condition: WaitCondition;
  /** When an unmet wait ends as expired. Null waits for the source alone. */
  deadline: string | null;
  /** The record's control revision when registered. A stop moves the record past it. */
  controlRevision: number;
  registeredAt: string;
  /** Set once, by the first observation. */
  outcome: { kind: WaitOutcomeKind; at: string; detail?: string } | null;
  /** One wake per wait: reserved before it is requested, consumed when its turn starts. */
  wake: { reservedAt: string; consumedAt: string | null } | null;
}

export interface WaitRequest {
  id: string;
  now: string;
  source: { kind: string; id: string };
  owner: WaitRegistration['owner'];
  deadlineMinutes?: number;
}

export type WaitResult =
  | { ok: true; record: ProjectRecord; wait: WaitRegistration; created: boolean }
  | { ok: false; reason: string };

export const revisionOf = (record: ProjectRecord): number => record.controlRevision ?? 0;

export function manualResumeMessage(kind: string, id: string): string {
  return `Sero cannot monitor ${kind} "${id}" for this project, so no wake is promised. Manual resume is required: end the wake with sleep or blocked and say what the user should check.`;
}

function isSourceKind(kind: string): kind is WaitSourceKind {
  return (WAIT_SOURCE_KINDS as readonly string[]).includes(kind);
}

/** Saves a wait on the record, or the existing open one for the same source and owner. */
export function registerWait(record: ProjectRecord, request: WaitRequest, supported: readonly WaitSourceKind[] = OBSERVABLE_SOURCES): WaitResult {
  const { kind, id } = request.source;
  if (!isSourceKind(kind) || !supported.includes(kind) || !id.trim()) return { ok: false, reason: manualResumeMessage(kind, id) };
  const { milestoneId, researchId } = request.owner;
  const known = milestoneId !== null
    ? record.milestones.some((milestone) => milestone.id === milestoneId)
    : record.pendingResearch?.some((entry) => entry.id === researchId) === true;
  if (!known) return { ok: false, reason: `No milestone or research "${milestoneId ?? researchId ?? ''}" on this project to wait for.` };
  const minutes = request.deadlineMinutes;
  if (minutes !== undefined && !(Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_DEADLINE_MINUTES)) {
    return { ok: false, reason: `deadlineMinutes must be between 1 and ${MAX_DEADLINE_MINUTES}.` };
  }
  const existing = record.waits?.find((wait) => wait.outcome === null && wait.source.kind === kind && wait.source.id === id && wait.owner.milestoneId === milestoneId && wait.owner.researchId === researchId);
  if (existing) return { ok: true, record, wait: existing, created: false };
  const wait: WaitRegistration = {
    id: request.id,
    owner: request.owner,
    source: { kind, id },
    condition: WAIT_CONDITIONS[kind],
    deadline: minutes === undefined ? null : new Date(Date.parse(request.now) + minutes * 60_000).toISOString(),
    controlRevision: revisionOf(record),
    registeredAt: request.now,
    outcome: null,
    wake: null,
  };
  return { ok: true, record: { ...record, waits: [...(record.waits ?? []), wait] }, wait, created: true };
}

function replaceWait(record: ProjectRecord, next: WaitRegistration): ProjectRecord {
  return { ...record, waits: (record.waits ?? []).map((wait) => (wait.id === next.id ? next : wait)) };
}

/** Waits that have not ended. */
export function openWaits(record: ProjectRecord): WaitRegistration[] {
  return (record.waits ?? []).filter((wait) => wait.outcome === null);
}

/**
 * Records what was observed. Only the first observation counts: a duplicate,
 * a late one, and one for a cancelled or expired wait all change nothing.
 */
export function observeWait(record: ProjectRecord, waitId: string, kind: WaitOutcomeKind, now: string, detail?: string): ProjectRecord {
  const wait = record.waits?.find((item) => item.id === waitId);
  if (!wait || wait.outcome !== null) return record;
  return replaceWait(record, { ...wait, outcome: { kind, at: now, ...(detail ? { detail } : {}) } });
}

export const cancelWait = (record: ProjectRecord, waitId: string, now: string, detail?: string): ProjectRecord =>
  observeWait(record, waitId, 'cancelled', now, detail);

/** Ends every open wait whose deadline has passed. */
export function expireDueWaits(record: ProjectRecord, now: string): ProjectRecord {
  return openWaits(record).reduce((current, wait) => (wait.deadline !== null && wait.deadline <= now
    ? observeWait(current, wait.id, 'expired', now, `Its deadline passed at ${wait.deadline} with the condition unmet.`)
    : current), record);
}

/** The earliest deadline among open waits, so the runtime can arm one timer for it. */
export function nextDeadline(record: ProjectRecord): string | null {
  return openWaits(record).map((wait) => wait.deadline).filter((at): at is string => at !== null).sort()[0] ?? null;
}

/**
 * A stop is final. It moves the control revision past every wait registered
 * before it and ends the open ones, so nothing that was matched or reserved
 * can wake the owner afterwards, and resuming the project does not revive it.
 */
export function stopWaits(record: ProjectRecord, now: string): ProjectRecord {
  const bumped: ProjectRecord = { ...record, controlRevision: revisionOf(record) + 1 };
  return openWaits(bumped).reduce((current, wait) => cancelWait(current, wait.id, now, 'The project was stopped.'), bumped);
}

/** Outcomes that tell the owner something. `uncertain` holds the project instead. */
const WAKING: readonly WaitOutcomeKind[] = ['satisfied', 'failed', 'expired'];

const current = (record: ProjectRecord, wait: WaitRegistration): boolean => wait.controlRevision === revisionOf(record);

/** Whether the project may start a paid turn for a wait now: not paused, blocked, capped or unauthorised. */
export function waitMayWake(record: ProjectRecord): boolean {
  return mayWakeForWork(record) && (!hasAgreement(record) || agreementApproved(record));
}

export type WakeResult =
  | { ok: true; record: ProjectRecord }
  | { ok: false; reason: string };

/** Reserves the wake for an ended wait. At most once per wait, and never past a stop or a pause. */
export function reserveWake(record: ProjectRecord, waitId: string, now: string): WakeResult {
  const wait = record.waits?.find((item) => item.id === waitId);
  if (!wait) return { ok: false, reason: `No wait "${waitId}".` };
  if (!wait.outcome || !WAKING.includes(wait.outcome.kind)) return { ok: false, reason: 'The wait has no outcome to wake for.' };
  if (wait.wake) return { ok: false, reason: 'The wake is already reserved.' };
  if (!current(record, wait)) return { ok: false, reason: 'The project was stopped after this wait was registered.' };
  if (!waitMayWake(record)) return { ok: false, reason: 'The project may not start work now. The outcome stays on the record.' };
  return { ok: true, record: replaceWait(record, { ...wait, wake: { reservedAt: now, consumedAt: null } }) };
}

/** Marks a reserved wake as started. A stale, missing or already consumed one is refused. */
export function consumeWake(record: ProjectRecord, waitId: string, now: string): WakeResult {
  const wait = record.waits?.find((item) => item.id === waitId);
  if (!wait?.wake || wait.wake.consumedAt !== null) return { ok: false, reason: 'No reserved wake to consume.' };
  if (!current(record, wait)) return { ok: false, reason: 'The project was stopped after this wait was registered.' };
  return { ok: true, record: replaceWait(record, { ...wait, wake: { ...wait.wake, consumedAt: now } }) };
}

/** Ended waits whose wake is reserved and not yet started, and not made stale by a stop. */
export function reservedWakes(record: ProjectRecord): WaitRegistration[] {
  return (record.waits ?? []).filter((wait) => wait.wake !== null && wait.wake.consumedAt === null && current(record, wait));
}

/** Ended waits that have not reserved a wake yet, for example because the project was paused. */
export function unreservedMatches(record: ProjectRecord): WaitRegistration[] {
  return (record.waits ?? []).filter((wait) => wait.wake === null && wait.outcome !== null && WAKING.includes(wait.outcome.kind) && current(record, wait));
}

/** One plain line for the owner's wake: what it waited for and how that ended. */
export function describeWait(wait: WaitRegistration): string {
  const what = `${wait.source.kind} ${wait.source.id} (${wait.owner.milestoneId ? `milestone ${wait.owner.milestoneId}` : `research ${wait.owner.researchId}`})`;
  const detail = wait.outcome?.detail ? ` ${wait.outcome.detail}` : '';
  switch (wait.outcome?.kind) {
    case 'satisfied': return `the wait on ${what} is satisfied: its condition (${wait.condition}) was observed.${detail}`;
    case 'failed': return `the wait on ${what} failed: the source ended without meeting its condition. This is not completion.${detail}`;
    case 'expired': return `the wait on ${what} expired before its condition was met. This is not completion.${detail}`;
    default: return `the wait on ${what} has no outcome yet.`;
  }
}
