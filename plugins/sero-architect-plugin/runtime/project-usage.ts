import type { AppRuntimeSubagentResult, AppRuntimeSubagentRunParams, OrchestratorUsageView } from '@sero-ai/common';
import { setAccountingIncomplete } from '../shared/accounting';
import { charge } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';

type Operation = { kind: 'research'; id: string } | { kind: 'capture'; id: string };
type AppRuntimeSubagentUsage = NonNullable<AppRuntimeSubagentResult['usage']>;
interface UsageDeps { host: Pick<ArchitectHost, 'now' | 'newId' | 'runStructured'>; store: RecordStore }

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
export async function chargeRoomPlanning(deps: Pick<UsageDeps, 'store'> & { host: Pick<ArchitectHost, 'now'> }, projectId: string, operation: { kind: 'research' | 'dispatch'; id: string }, usage?: OrchestratorUsageView): Promise<number> {
  let chargedUsd = 0;
  await deps.store.update(projectId, (fresh) => {
    const pending = operation.kind === 'research'
      ? fresh.pendingResearch?.find((entry) => entry.id === operation.id)
      : fresh.milestones.find((entry) => entry.id === operation.id)?.pendingDispatch;
    const previous = pending ? ('planningChargedUsd' in pending ? pending.planningChargedUsd ?? 0 : 'chargedUsd' in pending ? pending.chargedUsd ?? 0 : 0) : 0;
    chargedUsd = Math.max(previous, usage?.costUsd ?? 0);
    let next = charge(fresh, operation.kind === 'research' ? 'research' : 'dispatched', chargedUsd - previous, deps.host.now());
    next = setAccountingIncomplete(next, `room-planning:${operation.kind}:${operation.id}:${pending && 'request' in pending ? pending.request?.id ?? 'legacy' : 'research'}`, !usage || !!usage.incomplete);
    return operation.kind === 'research'
      ? { ...next, pendingResearch: next.pendingResearch?.map((entry) => entry.id === operation.id ? { ...entry, chargedUsd } : entry) }
      : { ...next, milestones: next.milestones.map((entry) => entry.id === operation.id && entry.pendingDispatch ? { ...entry, pendingDispatch: { ...entry.pendingDispatch, planningChargedUsd: chargedUsd } } : entry) };
  });
  return chargedUsd;
}
