/**
 * Project-lifetime totals for the inspector (spec architect-run-observability).
 *
 * Each run is folded on its own, within the same bound a run view uses, and
 * shared activity is read once from the shared journal. A shared charge links
 * to several runs but is counted once in the project total, and whatever the
 * budget charged that no journal holds is shown as unassigned rather than
 * spread over runs that did not record it.
 */

import type { ProjectRecord } from '../shared/record';
import type { JournalRecord, RunJournal } from './run-journal';
import { buildActivity } from './trace-activity';
import { summarizeTiming, summarizeTrace } from './trace-summary';

/** The same bound a run's summary folds, per run. */
const RUN_RECORD_LIMIT = 1000;
const PAGE = 200;

export interface LifetimeRun {
  id: string;
  label: string;
  kind: string;
  outcome: string;
  open: boolean;
  startedAt: string;
  endedAt: string | null;
  recorded: boolean;
  attributableUsd: number;
  /** Shared activity linked to this run. Already counted once in the project total. */
  linkedSharedUsd: number;
  activeMs: number;
  waitMs: number;
  incomplete: boolean;
  spend: { at: string; usd: number }[];
}

export interface LifetimeAnswer {
  projectId: string;
  runs: LifetimeRun[];
  sharedUsd: number;
  /** Budget spend no journal accounts for. Null when the budget total was not supplied. */
  unassignedUsd: number | null;
}

export function runLabel(run: { kind: string; objectiveId?: string | null }): string {
  if (run.kind === 'initial') return 'Initial delivery';
  return run.objectiveId ? `Maintenance · ${run.objectiveId}` : 'Maintenance';
}

async function fold(journal: RunJournal, projectId: string, journalId: string): Promise<{ records: JournalRecord[]; more: boolean; torn: boolean }> {
  const records: JournalRecord[] = [];
  let afterSeq: number | undefined;
  let torn = false;
  for (;;) {
    const page = await journal.readPage(projectId, journalId, { afterSeq, limit: Math.min(PAGE, RUN_RECORD_LIMIT - records.length) });
    records.push(...page.records);
    torn = torn || page.incomplete;
    if (page.nextAfterSeq === null) return { records, more: false, torn };
    if (records.length >= RUN_RECORD_LIMIT) return { records, more: true, torn };
    afterSeq = page.nextAfterSeq;
  }
}

export async function queryLifetime(
  deps: { journal: RunJournal; readProject(projectId: string): Promise<ProjectRecord | null> },
  projectId: string,
  knownSpendUsd?: number,
): Promise<LifetimeAnswer | null> {
  const project = await deps.readProject(projectId);
  if (!project) return null;
  const shared = await fold(deps.journal, projectId, 'shared');
  const sharedCharges = shared.records.filter((record) => record.kind === 'shared' && typeof record.costUsd === 'number');
  const sharedUsd = sharedCharges.reduce((sum, record) => sum + (record.costUsd as number), 0);

  const runs: LifetimeRun[] = [];
  for (const run of project.runs ?? []) {
    // One run at a time keeps the reads bounded by the run count, never parallel.
    const folded = await fold(deps.journal, projectId, run.id);
    const summary = summarizeTrace(folded.records, { projectId, runId: run.id });
    const timing = summarizeTiming(folded.records);
    const open = run.endedAt === null;
    runs.push({
      id: run.id,
      label: runLabel(run),
      kind: run.kind,
      outcome: run.outcome,
      open,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      recorded: folded.records.length > 0,
      attributableUsd: summary.attributableUsd,
      linkedSharedUsd: sharedCharges
        .filter((record) => Array.isArray(record.runIds) && record.runIds.includes(run.id))
        .reduce((sum, record) => sum + (record.costUsd as number), 0),
      activeMs: timing.activeMs,
      waitMs: timing.waitMs,
      incomplete: summary.incomplete || folded.more || folded.torn,
      spend: buildActivity(project, run.id, folded.records, open).view.spend,
    });
  }
  const accounted = runs.reduce((sum, run) => sum + run.attributableUsd, 0) + sharedUsd;
  return {
    projectId,
    runs,
    sharedUsd,
    unassignedUsd: knownSpendUsd === undefined ? null : Math.max(0, Math.round((knownSpendUsd - accounted) * 1_000_000) / 1_000_000),
  };
}
