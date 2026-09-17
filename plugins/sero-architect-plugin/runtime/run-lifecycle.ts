/**
 * Run identity and shared activity (spec architect-run-observability).
 *
 * One initial run covers setup, discovery and the charter through initial
 * delivery. Each later maintenance objective gets its own run, opened before
 * its first model call. The identity survives retries, pause/resume, restart
 * and work that outlives a Stop, so a run is never invented twice for one
 * objective and never closed as accepted without evidence.
 */

import type { ProjectRunOutcome } from '../shared/record';
import { activeRun, closeRun, linkRuns, linkSharedActivity, openRun } from '../shared/runs';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';

export interface RunLifecycleDeps {
  store: RecordStore;
  /** Detailed telemetry. Absent means run identity is still recorded, spans are not. */
  journal?: RunJournal;
}

/**
 * Opens the project's initial run. Idempotent: a project that already has one
 * keeps it, so a restart or a re-entered discovery never opens a second.
 */
export async function ensureInitialRun(
  deps: RunLifecycleDeps,
  projectId: string,
  now: string,
  runId = `run-initial-${projectId}`,
): Promise<string | null> {
  let opened: string | null = null;
  await deps.store.update(projectId, (record) => {
    if ((record.runs ?? []).some((run) => run.kind === 'initial')) return null;
    const result = openRun(record, { id: runId, kind: 'initial' }, now);
    if (!result.ok) return null;
    opened = result.run.id;
    return result.record;
  });
  return opened;
}

export interface MaintenanceRunInput {
  /** The objective this work answers: an issue, an event or a directive. */
  objectiveId: string;
}

export interface MaintenanceRunResult {
  runId: string | null;
  /** True when an existing identity answered instead of a new one. */
  reused: boolean;
  /** The earlier run of the same objective, when a later occurrence opened a new one. */
  linkedFrom?: string;
}

/**
 * Opens the run for one maintenance objective before its first model call.
 *
 * A repeat of the same objective reuses its identity, however many milestones
 * or dispatches it spans. A different objective opens its own run, even while
 * another objective is still in flight, so one owner turn that serves two
 * objectives stays linkable to both instead of being billed to one of them.
 * A later occurrence of an objective whose run already ended opens a new run
 * and links it to the earlier one.
 */
export async function openMaintenanceRun(
  deps: RunLifecycleDeps,
  projectId: string,
  input: MaintenanceRunInput,
  now: string,
  newRunId: string,
): Promise<MaintenanceRunResult> {
  let result: MaintenanceRunResult = { runId: null, reused: false };
  await deps.store.update(projectId, (record) => {
    const runs = record.runs ?? [];
    const open = runs.find((run) => run.kind === 'maintenance' && run.objectiveId === input.objectiveId && run.endedAt === null);
    if (open) {
      result = { runId: open.id, reused: true };
      return null;
    }
    const opened = openRun(record, { id: newRunId, kind: 'maintenance', objectiveId: input.objectiveId }, now);
    if (!opened.ok) return null;
    const earlier = runs.find((run) => run.kind === 'maintenance' && run.objectiveId === input.objectiveId);
    result = { runId: opened.run.id, reused: false, ...(earlier ? { linkedFrom: earlier.id } : {}) };
    return earlier ? linkRuns(opened.record, opened.run.id, earlier.id) : opened.record;
  });
  return result;
}

/**
 * Ends the most recently opened run.
 *
 * A pause, a budget stop, a restart or a user Stop is not accepted delivery.
 * Those outcomes stay visibly unfinished, and the run keeps its identity so
 * late work can still attach to it.
 */
export async function closeActiveRun(
  deps: RunLifecycleDeps,
  projectId: string,
  outcome: Exclude<ProjectRunOutcome, 'in-progress'>,
  now: string,
): Promise<string | null> {
  let closed: string | null = null;
  await deps.store.update(projectId, (record) => {
    const open = activeRun(record);
    if (!open) return null;
    closed = open.id;
    return closeRun(record, open.id, outcome, now);
  });
  return closed;
}

/** Ends one named run, for a runtime that already knows which objective finished. */
export async function closeRunFor(
  deps: RunLifecycleDeps,
  projectId: string,
  runId: string,
  outcome: Exclude<ProjectRunOutcome, 'in-progress'>,
  now: string,
): Promise<boolean> {
  const written = await deps.store.update(projectId, (record) => {
    if (!(record.runs ?? []).some((run) => run.id === runId && run.endedAt === null)) return null;
    return closeRun(record, runId, outcome, now);
  });
  return written !== null;
}

export interface SharedActivityInput {
  /** Stable identity for the activity, so a replay never charges it twice. */
  activityId: string;
  /** The objectives this one activity served. */
  runIds: string[];
  at: string;
  /** Null when the cost is unknown. Never zero for "unknown". */
  costUsd?: number | null;
  source?: string;
  note?: string;
}

/**
 * Records one activity that served several objectives.
 *
 * It is written to the project's shared journal once and linked from each run.
 * Lifetime totals then count it once, and no run presents a guessed share as an
 * exact attributed cost.
 */
export async function recordSharedActivity(
  deps: RunLifecycleDeps,
  projectId: string,
  input: SharedActivityInput,
  _now: string,
): Promise<{ chargedOnce: boolean; linkedRunIds: string[] }> {
  const linked: string[] = [];
  await deps.store.update(projectId, (record) => {
    const alreadyLinked = (record.runs ?? []).some((run) => run.sharedActivityIds?.includes(input.activityId));
    if (alreadyLinked) return null;
    let next = record;
    for (const runId of input.runIds) {
      if (!(record.runs ?? []).some((run) => run.id === runId)) continue;
      next = linkSharedActivity(next, runId, input.activityId);
      linked.push(runId);
    }
    return next === record ? null : next;
  });

  if (linked.length === 0) return { chargedOnce: true, linkedRunIds: [] };
  if (deps.journal) {
    await deps.journal.appendShared(projectId, {
      kind: 'shared',
      at: input.at,
      source: input.source ?? 'owner:wake',
      key: input.activityId,
      ...(input.costUsd !== undefined ? { costUsd: input.costUsd } : {}),
      ...(input.note ? { note: input.note } : {}),
      runIds: linked,
    });
  }
  return { chargedOnce: true, linkedRunIds: linked };
}
