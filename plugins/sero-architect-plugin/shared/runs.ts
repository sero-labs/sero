// Run identity: one initial run covers setup through initial delivery, and each
// later maintenance objective has its own run (spec architect-run-observability).
//
// These are pure record transforms. The caller writes them through the record
// store, so a run reference is never persisted outside the single writer.

import type { ProjectRecord, ProjectRun, ProjectRunKind, ProjectRunOutcome } from './record';

export const PROJECT_RUN_KINDS: readonly ProjectRunKind[] = ['initial', 'maintenance'];

export const PROJECT_RUN_OUTCOMES: readonly ProjectRunOutcome[] = [
  'in-progress',
  'delivered',
  'no-work-needed',
  'stopped',
  'blocked',
  'incomplete',
];

/** Every run that is still open. Several maintenance objectives can be in flight at once. */
export function openRuns(record: ProjectRecord): ProjectRun[] {
  return (record.runs ?? []).filter((run) => run.endedAt === null);
}

/** The run that most recently opened and has not ended. */
export function activeRun(record: ProjectRecord): ProjectRun | undefined {
  const open = openRuns(record);
  return open[open.length - 1];
}

export function runById(record: ProjectRecord, runId: string): ProjectRun | undefined {
  return (record.runs ?? []).find((run) => run.id === runId);
}

/** True when the project already has its one initial run. */
export function hasInitialRun(record: ProjectRecord): boolean {
  return (record.runs ?? []).some((run) => run.kind === 'initial');
}

export interface OpenRunInput {
  id: string;
  kind: ProjectRunKind;
  /** The maintenance objective this run answers. Absent for the initial run. */
  objectiveId?: string | null;
  /** Another run's id when one coalesced cause reuses an existing objective. */
  coalescedFrom?: string[];
}

export type OpenRunResult =
  | { ok: true; record: ProjectRecord; run: ProjectRun }
  | { ok: false; error: string };

/**
 * Opens a run before its first observable work. One objective has one run, but
 * several objectives can be in flight at once, so this does not close others.
 */
export function openRun(record: ProjectRecord, input: OpenRunInput, now: string): OpenRunResult {
  if (!input.id) return { ok: false, error: 'A run needs an id.' };
  if (runById(record, input.id)) return { ok: false, error: `Run ${input.id} already exists.` };
  if (input.kind === 'initial' && hasInitialRun(record)) {
    return { ok: false, error: 'This project already has its initial run.' };
  }
  const run: ProjectRun = {
    id: input.id,
    kind: input.kind,
    objectiveId: input.objectiveId ?? null,
    startedAt: now,
    endedAt: null,
    outcome: 'in-progress',
    ...(input.coalescedFrom?.length ? { coalescedFrom: [...input.coalescedFrom] } : {}),
  };
  return { ok: true, record: { ...record, runs: [...(record.runs ?? []), run] }, run };
}

/**
 * Ends a run. `delivered` and `no-work-needed` are outcomes the runtime has
 * evidence for; a pause, a budget stop or a failure is not accepted delivery,
 * so those outcomes stay visibly unfinished in accounting.
 */
export function closeRun(
  record: ProjectRecord,
  runId: string,
  outcome: Exclude<ProjectRunOutcome, 'in-progress'>,
  now: string,
): ProjectRecord {
  return {
    ...record,
    runs: (record.runs ?? []).map((run) =>
      run.id === runId ? { ...run, endedAt: now, outcome } : run,
    ),
  };
}

/** Records that two runs belong together, or that one objective was split. */
export function linkRuns(record: ProjectRecord, fromRunId: string, toRunId: string): ProjectRecord {
  if (fromRunId === toRunId) return record;
  return {
    ...record,
    runs: (record.runs ?? []).map((run) =>
      run.id === fromRunId ? { ...run, linkedRunIds: unique([...(run.linkedRunIds ?? []), toRunId]) } : run,
    ),
  };
}

/**
 * Links one shared activity to a run. The activity is charged once in lifetime
 * totals; each linked run shows it as linked cost, never as a guessed share.
 */
export function linkSharedActivity(record: ProjectRecord, runId: string, sharedActivityId: string): ProjectRecord {
  return {
    ...record,
    runs: (record.runs ?? []).map((run) =>
      run.id === runId ? { ...run, sharedActivityIds: unique([...(run.sharedActivityIds ?? []), sharedActivityId]) } : run,
    ),
  };
}

/** Records the cause a maintenance run answers, so duplicate causes reuse one identity. */
export function markCoalesced(record: ProjectRecord, runId: string, fromRunId: string): ProjectRecord {
  return {
    ...record,
    runs: (record.runs ?? []).map((run) =>
      run.id === runId ? { ...run, coalescedFrom: unique([...(run.coalescedFrom ?? []), fromRunId]) } : run,
    ),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
