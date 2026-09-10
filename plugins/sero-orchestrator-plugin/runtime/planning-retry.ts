import { setTimeout as delay } from 'node:timers/promises';
import type { ModelRunParams, ModelRunResult, OrchestratorHost } from './host';
import { runTrackedModel, type UsageSink } from './usage-tracking';

/** Retry only tool-free planning calls rejected before any billed output. */
export async function runPlanningWithRetry(host: OrchestratorHost, params: ModelRunParams, sink?: UsageSink): Promise<ModelRunResult> {
  if (params.platformTools !== 'none') throw new Error('Planning retries require a tool-free call.');
  for (let attempt = 0; ; attempt += 1) {
    params.signal?.throwIfAborted();
    const result = await runTrackedModel(host, params, sink).catch((error: unknown): ModelRunResult => ({
      response: '', error: error instanceof Error ? error.message : String(error),
    }));
    const transient = result.error && /\b(429|502|503|504|ECONNRESET|ETIMEDOUT)\b/.test(result.error);
    if (!transient || attempt >= 2 || result.response || result.usage) return result;
    const waitMs = 1000 * 2 ** attempt;
    host.log(`Planning service unavailable. Retry ${attempt + 1} of 2 in ${waitMs / 1000}s.`);
    await delay(waitMs, undefined, { signal: params.signal });
  }
}
