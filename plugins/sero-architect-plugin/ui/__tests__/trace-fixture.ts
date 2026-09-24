import type { ActivityNodeView, ActivityView, TracePage } from '../lib/trace';

export const T = (minutes: number): string => new Date(Date.parse('2026-09-14T09:00:00.000Z') + minutes * 60_000).toISOString();

export function node(id: string, overrides: Partial<ActivityNodeView> = {}): ActivityNodeView {
  return {
    id, parentId: null, label: id, kind: 'workflow', group: 'workflows', synthetic: false, rawId: id,
    startAt: T(0), endAt: T(10), state: 'done', retries: 0, costUsd: 0.1, ownCostUsd: null, charges: 0,
    tokens: null, coverage: 'aggregate', ...overrides,
  };
}

export function activity(nodes: ActivityNodeView[] = [], overrides: Partial<ActivityView> = {}): ActivityView {
  return {
    nodes,
    spend: [],
    byGroup: [],
    byModel: [],
    counters: { ownerTurns: 0, failures: 0, retries: 0, waits: 0 },
    elapsed: nodes.length ? { from: T(0), to: T(60) } : null,
    ...overrides,
  };
}

export function tracePage(overrides: Partial<TracePage> = {}): TracePage {
  return {
    recorded: true,
    summary: {
      attributableUsd: 0, aggregateUsd: 0, hasAggregate: false, unpricedCharges: 0, tokensMeasured: false, incomplete: false,
      requests: 0, toolCalls: 0, retries: 0, compactions: 0, errors: 0,
    },
    timing: { activeMs: 0, workerMs: 0, waitMs: 0, waitByCause: {}, openWaits: [] },
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, unavailable: [] },
    records: [],
    nextAfterSeq: null,
    incomplete: false,
    activity: activity(),
    linkedSharedUsd: 0,
    ...overrides,
  };
}
