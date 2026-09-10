import type { UsageSummary } from '../shared/types';
import { mergeCumulativeUsage, mergeUsage, usageDelta } from '../shared/usage';
import type { ModelRunParams, ModelRunResult, ModelRunUsage, OrchestratorHost } from './host';

export type UsageSink = (delta: UsageSummary) => void | Promise<void>;

/** Save each call before it starts, then charge only new cumulative SDK usage. */
export async function runTrackedModel(host: OrchestratorHost, params: ModelRunParams, sink?: UsageSink): Promise<ModelRunResult> {
  await sink?.({ startedCalls: 1 });
  let latest: UsageSummary | undefined;
  let writes = Promise.resolve();
  const report = (usage: UsageSummary) => {
    const next = mergeCumulativeUsage(latest, usage)!;
    const delta = usageDelta(latest, next);
    latest = next;
    writes = writes.then(async () => { await sink?.(delta); });
  };
  const result = await host.runStructured({
    ...params,
    onUsage: (usage) => { params.onUsage?.(usage); report(usage); },
  }).catch((error: unknown): ModelRunResult => ({ response: '', error: error instanceof Error ? error.message : String(error) }));
  const incomplete = !result.usage || result.usage.costUsd === undefined || !!result.error || result.usage.incomplete;
  if (result.usage) report(result.usage);
  await writes;
  await sink?.({ finishedCalls: 1, ...(incomplete ? { incomplete: true } : {}) });
  if (!latest) return result;
  const usage: ModelRunUsage = {
    inputTokens: latest.inputTokens ?? 0,
    outputTokens: latest.outputTokens ?? 0,
    totalTokens: latest.totalTokens ?? 0,
    ...(latest.costUsd === undefined ? {} : { costUsd: latest.costUsd }),
    ...(incomplete || latest.incomplete ? { incomplete: true } : {}),
  };
  return { ...result, usage };
}

/** The existing store queue adds independent call deltas to the current record. */
export function loopUsageSink(host: OrchestratorHost, loopId: string, field: 'planningUsage' | 'auxiliaryUsage'): UsageSink {
  return async (delta) => {
    await host.updateState((state) => ({
      ...state,
      loops: state.loops.map((loop) => loop.id === loopId ? { ...loop, [field]: mergeUsage(loop[field], delta) } : loop),
    }));
  };
}
