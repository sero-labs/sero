/**
 * Bookkeeping for planning calls that have not yet produced a Room.
 *
 * A Room is planned before it exists, so what the planner has cost — and the run
 * to watch while it works — is held here, keyed by the creation request the
 * caller named. The entry is dropped once the Room is created.
 *
 * `runId` is optional so a record written before the live view existed still
 * loads: it simply has nothing to watch.
 *
 * Split out of room-store.ts (500-LOC limit).
 */

import type { AppRuntimeContext } from '@sero-ai/common';

import type { UsageSummary } from '../../shared/usage-types';
import { mergeUsage } from '../../shared/usage';

export type PendingPlanning = UsageSummary & { runId?: string };

export interface PendingPlanningStore {
  read(requestId: string): Promise<PendingPlanning | undefined>;
  /** Add one call's usage. The run id already recorded is kept. */
  update(requestId: string, usage: UsageSummary): Promise<void>;
  /** Record the planning call's run id, so its live block can open on it. */
  markRun(requestId: string, runId: string): Promise<void>;
  /** Take the entry and forget it — the Room it was planning now exists. */
  consume(requestId: string): Promise<PendingPlanning | undefined>;
}

/**
 * @param filePath the file this bookkeeping is stored in
 * @param serialize the store's write queue, so these writes keep its order
 */
export function createPendingPlanningStore(
  appState: AppRuntimeContext['host']['appState'],
  filePath: string,
  serialize: <T>(task: () => Promise<T>) => Promise<T>,
): PendingPlanningStore {
  let cache: Record<string, PendingPlanning> | null = null;

  async function ensure(): Promise<Record<string, PendingPlanning>> {
    if (cache) return cache;
    const loaded = await appState.read<Record<string, PendingPlanning>>(filePath);
    cache ??= Object.assign(Object.create(null) as Record<string, PendingPlanning>, loaded ?? {});
    return cache;
  }

  async function write(next: Record<string, PendingPlanning>): Promise<void> {
    Object.setPrototypeOf(next, null);
    await appState.update(filePath, () => next);
    cache = next;
  }

  return {
    read: (requestId) => serialize(async () => {
      const pending = await ensure();
      return pending[requestId] ? structuredClone(pending[requestId]) : undefined;
    }),

    update: (requestId, usage) => serialize(async () => {
      const pending = await ensure();
      const previous = pending[requestId];
      // mergeUsage carries usage counters only, so the run id is put back by
      // hand — a later usage report must not wipe the run a view is watching.
      const merged = mergeUsage(previous, usage) ?? {};
      await write({
        ...pending,
        [requestId]: previous?.runId ? { ...merged, runId: previous.runId } : merged,
      });
    }),

    markRun: (requestId, runId) => serialize(async () => {
      const pending = await ensure();
      await write({ ...pending, [requestId]: { ...pending[requestId], runId } });
    }),

    consume: (requestId) => serialize(async () => {
      const pending = await ensure();
      const entry = pending[requestId];
      if (!entry) return undefined;
      const next = { ...pending };
      delete next[requestId];
      await write(next);
      return structuredClone(entry);
    }),
  };
}
