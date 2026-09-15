import type { AppRuntimeSubagentResult, AppRuntimeSubagentRunParams, OrchestratorUsageView } from '@sero-ai/common';
import { setAccountingIncomplete } from '../shared/accounting';
import { charge } from '../shared/lifecycle';
import { activeRun } from '../shared/runs';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';

type Operation = { kind: 'research'; id: string } | { kind: 'capture'; id: string };
type AppRuntimeSubagentUsage = NonNullable<AppRuntimeSubagentResult['usage']>;
interface UsageDeps {
  host: Pick<ArchitectHost, 'now' | 'newId' | 'runStructured'>;
  store: RecordStore;
  /**
   * The trace journal. Budget and trace then consume the same source deltas, so
   * a run's total reconciles with the project spend for that scope.
   */
  journal?: RunJournal;
}

/**
 * Records one charged delta in the run journal. The delta, not the cumulative
 * total, is written: summing the journal reproduces exactly what was charged,
 * and a replayed report adds nothing.
 */
export async function recordCharge(
  deps: { host: Pick<ArchitectHost, 'now'> & Partial<Pick<ArchitectHost, 'log'>>; journal?: RunJournal },
  record: ProjectRecord,
  source: string,
  delta: number,
  coverage: 'call' | 'aggregate',
  runId?: string,
): Promise<void> {
  const journal = deps.journal;
  // Work that was dispatched under a run stays charged to that run, even after
  // a Stop closed it or a later objective opened another one. Only work with no
  // dispatch-time run of its own falls back to the run that is open now.
  const target = runId ?? activeRun(record)?.id;
  if (!journal || !target || delta === 0) return;
  await journal.append(record.id, target, {
    kind: 'usage',
    at: deps.host.now(),
    source,
    key: `${source}:${delta}`,
    costUsd: delta,
    coverage,
  }).catch((error: unknown) => {
    // The budget already holds this delta. The trace now lacks it, which the
    // summary reports as a reconciliation gap rather than hiding.
    try { deps.host.log?.(`usage ${source} (${delta}) was not written to run ${target}: ${error instanceof Error ? error.message : String(error)}`); } catch { /* Reporting must not fail execution. */ }
  });
}

/** Each SDK call starts at zero; pending costs retain earlier interrupted calls. */
export async function runProjectModel(deps: UsageDeps, record: ProjectRecord, operation: Operation, params: AppRuntimeSubagentRunParams): Promise<AppRuntimeSubagentResult & { recordedCostUsd: number }> {
  const source = `${operation.kind}:${deps.host.newId('usage')}`;
  let latestCost = 0;
  let recordedCostUsd = operation.kind === 'research'
    ? record.pendingResearch?.find((entry) => entry.id === operation.id)?.chargedUsd ?? 0
    : record.pendingEvidence?.find((entry) => entry.milestoneId === operation.id)?.chargedUsd ?? 0;
  let writes = Promise.resolve();
  await deps.store.update(record.id, (fresh) => setAccountingIncomplete(fresh, source, true));
  const report = (usage: AppRuntimeSubagentUsage) => {
    const cost = Math.max(latestCost, usage.costUsd ?? 0);
    const delta = cost - latestCost;
    latestCost = cost;
    recordedCostUsd += delta;
    writes = writes.then(async () => {
      await deps.store.update(record.id, (fresh) => {
        const next = charge(fresh, operation.kind === 'research' ? 'research' : 'dispatched', delta, deps.host.now());
        return operation.kind === 'research'
          ? { ...next, pendingResearch: next.pendingResearch?.map((entry) => entry.id === operation.id ? { ...entry, chargedUsd: (entry.chargedUsd ?? 0) + delta } : entry) }
          : { ...next, pendingEvidence: next.pendingEvidence?.map((entry) => entry.milestoneId === operation.id ? { ...entry, chargedUsd: (entry.chargedUsd ?? 0) + delta } : entry) };
      });
      // The same delta the budget just charged, so the two cannot drift.
      await recordCharge(deps, record, source, delta, usage.costUsd === undefined ? 'aggregate' : 'call',
        operation.kind === 'research' ? record.pendingResearch?.find((entry) => entry.id === operation.id)?.project?.runId : undefined);
    });
  };
  const result = await deps.host.runStructured({ ...params, onUsage: (usage) => { params.onUsage?.(usage); report(usage); } })
    .catch((error: unknown): AppRuntimeSubagentResult => ({ response: '', error: error instanceof Error ? error.message : String(error) }));
  if (result.usage) report(result.usage);
  await writes;
  await deps.store.update(record.id, (fresh) => setAccountingIncomplete(fresh, source, !!result.error || result.usage?.costUsd === undefined || !!result.usage.incomplete));
  return { ...result, recordedCostUsd };
}

/** Room preparation reports cumulative request usage, including failed attempts. */
export async function chargeRoomPlanning(deps: Pick<UsageDeps, 'store'> & { host: Pick<ArchitectHost, 'now'>; journal?: RunJournal }, projectId: string, operation: { kind: 'research' | 'dispatch'; id: string }, usage?: OrchestratorUsageView): Promise<number> {
  let chargedUsd = 0;
  let recordForJournal: ProjectRecord | null = null;
  let deltaForJournal = 0;
  let runId: string | undefined;
  await deps.store.update(projectId, (fresh) => {
    recordForJournal = fresh;
    const pending = operation.kind === 'research'
      ? fresh.pendingResearch?.find((entry) => entry.id === operation.id)
      : fresh.milestones.find((entry) => entry.id === operation.id)?.pendingDispatch;
    runId = operation.kind === 'research'
      ? fresh.pendingResearch?.find((entry) => entry.id === operation.id)?.project?.runId
      : fresh.milestones.find((entry) => entry.id === operation.id)?.pendingDispatch?.project?.runId;
    const previous = pending ? ('planningChargedUsd' in pending ? pending.planningChargedUsd ?? 0 : 'chargedUsd' in pending ? pending.chargedUsd ?? 0 : 0) : 0;
    chargedUsd = Math.max(previous, usage?.costUsd ?? 0);
    deltaForJournal = chargedUsd - previous;
    let next = charge(fresh, operation.kind === 'research' ? 'research' : 'dispatched', chargedUsd - previous, deps.host.now());
    next = setAccountingIncomplete(next, `room-planning:${operation.kind}:${operation.id}:${pending && 'request' in pending ? pending.request?.id ?? 'legacy' : 'research'}`, !usage || !!usage.incomplete);
    return operation.kind === 'research'
      ? { ...next, pendingResearch: next.pendingResearch?.map((entry) => entry.id === operation.id ? { ...entry, chargedUsd } : entry) }
      : { ...next, milestones: next.milestones.map((entry) => entry.id === operation.id && entry.pendingDispatch ? { ...entry, pendingDispatch: { ...entry.pendingDispatch, planningChargedUsd: chargedUsd } } : entry) };
  });
  // Room planning reports cumulative usage; only the delta is journaled.
  if (recordForJournal) {
    await recordCharge(
      { host: deps.host, journal: deps.journal },
      recordForJournal,
      `room-planning:${operation.kind}:${operation.id}`,
      deltaForJournal,
      usage?.costUsd === undefined ? 'aggregate' : 'call',
      runId,
    );
  }
  return chargedUsd;
}
