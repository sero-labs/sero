/**
 * What the Work view says about a wait, and the limits list the inspector shows.
 * Both are read from the record alone: a late or repeated event can only change
 * the record, never this card, and a wait that ended without a result is never
 * shown as finished work.
 */

import { effectiveLimits, type LimitOrigin } from '../../shared/effective-limits';
import type { ProjectRecord } from '../../shared/record';
import { mayWakeForWork } from '../../shared/lifecycle';
import type { WaitRegistration } from '../../shared/waits';
import { clock } from './inspector-format';

export interface FactRow {
  label: string;
  value: string;
}

export type WaitCardKind = 'waiting' | 'working' | 'on-hold' | 'manual';

export interface WaitCard {
  kind: WaitCardKind;
  /** The activity word beside the icon. */
  word: string;
  rows: FactRow[];
  /** Whether the card offers Resume work. */
  canResume: boolean;
}

const SOURCE_NAME = { child: 'Child work', process: 'Process', ci: 'CI checks' } as const;

const cause = (wait: WaitRegistration): string => `${SOURCE_NAME[wait.source.kind]} ${wait.source.id}`;

/** Whole minutes. Under a minute says so rather than showing zero. */
export function waitDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'under 1m';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The time, with the day when it is not today. */
function when(at: string, now: number): string {
  const date = new Date(Date.parse(at));
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return clock(at);
  return `${date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })} ${clock(at)}`;
}

function deadlineRow(wait: WaitRegistration, now: number): FactRow | null {
  if (wait.deadline === null) return null;
  const left = Date.parse(wait.deadline) - now;
  return { label: 'Deadline', value: `${when(wait.deadline, now)}, ${left > 0 ? `in ${waitDuration(left)}` : 'passed'}` };
}

/** The time the project spent waiting: every wait from its start to its end, and a manual hold until now. */
function waitingMs(record: ProjectRecord, now: number): number {
  const observed = (record.waits ?? []).reduce((sum, wait) => {
    const end = wait.outcome ? Date.parse(wait.outcome.at) : now;
    const span = end - Date.parse(wait.registeredAt);
    return Number.isFinite(span) && span > 0 ? sum + span : sum;
  }, 0);
  return observed + manualHoldMs(record, now);
}

function manualHoldMs(record: ProjectRecord, now: number): number {
  if (record.blockedReason === null || openWait(record)) return 0;
  const start = Date.parse([...record.history].reverse().find((entry) => entry.overlay === 'blocked')?.at ?? record.updatedAt);
  return Number.isFinite(start) && now > start ? now - start : 0;
}

/** Time since the newest run began, less the time spent waiting. */
function activeMs(record: ProjectRecord, waiting: number, now: number): number {
  const run = record.runs?.at(-1);
  const start = Date.parse(run?.startedAt ?? record.createdAt);
  const end = run?.endedAt ? Date.parse(run.endedAt) : now;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start - waiting) : 0;
}

const openWait = (record: ProjectRecord): WaitRegistration | undefined => (record.waits ?? []).filter((wait) => wait.outcome === null).at(-1);

const times = (record: ProjectRecord, now: number): FactRow[] => {
  const waiting = waitingMs(record, now);
  return [{ label: 'Active time', value: waitDuration(activeMs(record, waiting, now)) }, { label: 'Waiting time', value: waitDuration(waiting) }];
};

const compact = (rows: (FactRow | null)[]): FactRow[] => rows.filter((row): row is FactRow => row !== null);

/**
 * The card for the newest wait, or null when the project has none to explain.
 * An open wait is Waiting. An ended one whose owner has not started again is
 * On hold, and once it has, Working while the project may do work. The manual
 * case is the project's own blocked state.
 */
export function waitCard(record: ProjectRecord, now: number): WaitCard | null {
  const open = openWait(record);
  if (open) {
    return { kind: 'waiting', word: 'Waiting', canResume: false, rows: compact([{ label: 'Waiting for', value: cause(open) }, deadlineRow(open, now), ...times(record, now)]) };
  }
  if (record.blockedReason !== null) {
    return { kind: 'manual', word: 'Waiting for you', canResume: true, rows: [{ label: 'Reason', value: record.blockedReason }, { label: 'Resume', value: 'You resume it' }, ...times(record, now)] };
  }
  const last = (record.waits ?? []).at(-1);
  const outcome = last?.outcome;
  if (!last || !outcome) return null;
  if (outcome.kind === 'expired' && last.wake?.consumedAt == null) {
    return { kind: 'on-hold', word: 'On hold', canResume: true, rows: compact([{ label: 'Waited for', value: `${cause(last)}, no result` }, deadlineRow(last, now), ...times(record, now)]) };
  }
  if (last.wake?.consumedAt == null || !mayWakeForWork(record)) return null;
  const ended = outcome.kind === 'satisfied' ? `finished at ${when(outcome.at, now)}` : outcome.kind === 'failed' ? `failed at ${when(outcome.at, now)}` : outcome.kind === 'expired' ? 'no result' : null;
  if (ended === null) return null;
  return { kind: 'working', word: 'Working', canResume: false, rows: [{ label: 'Waited for', value: `${cause(last)}, ${ended}` }, ...times(record, now)] };
}

export interface LimitRow {
  id: string;
  label: string;
  value: string;
  setBy: string;
}

const SET_BY: Record<LimitOrigin, string> = {
  user: 'You set this',
  safety: 'Safety stop',
  default: 'Default',
  agent: 'Chosen by the Architect',
};

export const limitRows = (record: ProjectRecord): LimitRow[] =>
  effectiveLimits(record).map(({ id, label, value, origin }) => ({ id, label, value, setBy: SET_BY[origin] }));
