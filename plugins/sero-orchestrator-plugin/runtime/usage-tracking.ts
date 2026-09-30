import { createRunIdCapture } from '@sero-ai/common';
import type { UsageSummary } from '../shared/types';
import { mergeCumulativeUsage, mergeUsage, usageDelta } from '../shared/usage';
import type { ModelRunParams, ModelRunResult, ModelRunUsage, OrchestratorHost } from './host';
import { clearLiveCall, markLiveCall, type LiveCallTarget } from './live-call';

export type UsageSink = (delta: UsageSummary) => void | Promise<void>;

/**
 * What to record while a one-answer call runs.
 *
 * A `loop` call is written to that loop's runtime and cleared when the call
 * returns. `onRunId` hands the raw id to any other surface that keeps its own
 * record (a Room's pending planning entry or a Room being adjusted).
 */
export interface LiveCallWatch {
  loop?: LiveCallTarget;
  onRunId?: (runId: string) => void;
}

/**
 * Save each call before it starts, then charge only new cumulative SDK usage.
 *
 * With a `watch` the call is also recorded while it runs, so a view can open a
 * live block on the reply as the model writes it. A loop record is cleared when
 * the call returns, however it returns.
 */
export async function runTrackedModel(
  host: OrchestratorHost,
  params: ModelRunParams,
  sink?: UsageSink,
  watch?: LiveCallWatch,
): Promise<ModelRunResult> {
  await sink?.({ startedCalls: 1 });
  let latest: UsageSummary | undefined;
  let writes = Promise.resolve();
  // The mark is written from a sync observation callback, so its write is held
  // here and awaited before the clear — the clear can never overtake it.
  let liveCallWrite = Promise.resolve();
  // The run's own first observation carries the tracker run id. Later records
  // are the subagent session's and carry a different id, so the id is taken once.
  const captureRunId = createRunIdCapture();
  const report = (usage: UsageSummary) => {
    const next = mergeCumulativeUsage(latest, usage)!;
    const delta = usageDelta(latest, next);
    latest = next;
    writes = writes.then(async () => { await sink?.(delta); });
  };

  try {
    const result = await host.runStructured({
      ...params,
      onObservation: (record) => {
        const runId = captureRunId(record);
        if (runId) {
          if (watch?.loop) liveCallWrite = markLiveCall(host, watch.loop, runId);
          watch?.onRunId?.(runId);
        }
        params.onObservation?.(record);
      },
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
  } finally {
    if (watch?.loop) {
      await liveCallWrite;
      await clearLiveCall(host, watch.loop.loopId);
    }
  }
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
