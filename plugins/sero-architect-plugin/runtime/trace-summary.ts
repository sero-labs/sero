/**
 * Trace summaries (spec architect-run-observability).
 *
 * A summary is folded from the run journal, which is also what the budget
 * charges from. Both therefore consume the same source deltas, and a run's
 * trace total reconciles with the project spend for the same scope by
 * construction rather than by coincidence.
 *
 * Two rules the inspector depends on:
 *
 * - A parent's inclusive cost is for inspection. It is never added to the
 *   total again once its children are counted.
 * - Usage that arrived without call detail stays labelled aggregate. It is a
 *   known amount with unknown coverage, not a fabricated call.
 */

import type { ObservationUsage } from '@sero-ai/common';

import type { JournalRecord, RunSummary } from './run-journal';

export interface TraceTotals {
  /** Everything charged to this run, from the leaf deltas. A parent's inclusive
   * sum is never added here a second time. */
  attributableUsd: number;
  /** The subset of the total whose coverage is a bare total, not call detail. */
  aggregateUsd: number;
  /** True when at least one charged record reported aggregate coverage. */
  hasAggregate: boolean;
  /** Charges that arrived with no price: work that happened, at an unknown cost. */
  unpricedCharges: number;
  /** True when any record reported a token counter. False means tokens are unknown, not zero. */
  tokensMeasured: boolean;
  /** True when any record was incomplete or a span never closed. */
  incomplete: boolean;
  requests: number;
  toolCalls: number;
  retries: number;
  compactions: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function emptyTraceTotals(): TraceTotals {
  return {
    attributableUsd: 0,
    aggregateUsd: 0,
    hasAggregate: false,
    unpricedCharges: 0,
    tokensMeasured: false,
    incomplete: false,
    requests: 0,
    toolCalls: 0,
    retries: 0,
    compactions: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

/**
 * The token counters that are disjoint after normalization. `reasoningTokens`
 * is deliberately absent: the provider reports it as a subset of output, so
 * adding it here would count those tokens twice.
 */
const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;
type TokenField = (typeof TOKEN_FIELDS)[number];

/**
 * Folds one journal record into the totals.
 *
 * A `usage` record carries the delta a source reported, never its cumulative
 * total, so a replayed or repeated report cannot double-count. A `request-end`
 * with usage is the same money described a second time, so only records that
 * declare themselves as the charging source move the total.
 */
export function foldTraceTotals(record: JournalRecord, totals: TraceTotals): TraceTotals {
  const next: TraceTotals = { ...totals };
  const usage = isUsage(record.usage) ? record.usage : undefined;
  const isCharge = record.kind === 'usage';

  if (isCharge) {
    const cost = typeof record.costUsd === 'number' ? record.costUsd : undefined;
    if (cost !== undefined) {
      // Aggregate-only usage is still this run's cost, so it counts in the
      // total. `aggregateUsd` labels the subset whose coverage is unknown, so a
      // reader can tell measured calls from a bare total instead of losing it.
      next.attributableUsd += cost;
      if (record.coverage === 'aggregate') {
        next.aggregateUsd += cost;
        next.hasAggregate = true;
      }
    } else {
      next.unpricedCharges += 1;
    }
  }

  if (usage) {
    // Token categories are disjoint after normalization; reasoning is a subset
    // of output and is therefore not added a second time.
    for (const field of TOKEN_FIELDS) {
      const value = usage[field as TokenField];
      if (typeof value === 'number') {
        next[field] += value;
        next.tokensMeasured = true;
      }
    }
    if (usage.incomplete) next.incomplete = true;
  }

  if (record.recordKind === 'request-end') next.requests += 1;
  if (record.recordKind === 'tool-end') next.toolCalls += 1;
  if (record.recordKind === 'operation-end' && record.outcome === 'failed') next.errors += 1;
  if (record.recordKind === 'compaction') next.compactions += 1;
  if (typeof record.retryOf === 'string') next.retries += 1;
  return next;
}

function isUsage(value: unknown): value is ObservationUsage {
  return typeof value === 'object' && value !== null;
}

export interface SummarizeOptions {
  projectId: string;
  runId: string;
  /** Total charged to the project for this scope, from the budget side. */
  knownSpendUsd?: number;
}

export interface TraceSummary extends TraceTotals {
  projectId: string;
  runId: string;
  /** Records folded in. */
  records: number;
  /**
   * Present only when `knownSpendUsd` was supplied. A non-zero value means the
   * trace and the budget disagree, which the inspector must show rather than hide.
   */
  reconciliationUsd?: number;
}

/**
 * Folds a page set into a summary. `pages` is supplied by the caller so the
 * reader stays bounded: a caller pages until it stops, never loading a whole
 * journal to answer one question.
 */
export function summarizeTrace(records: readonly JournalRecord[], options: SummarizeOptions): TraceSummary {
  let totals = emptyTraceTotals();
  const opened = new Set<string>();
  const closed = new Set<string>();
  for (const record of records) {
    totals = foldTraceTotals(record, totals);
    if (record.recordKind === 'operation-start' && typeof record.operationId === 'string') opened.add(record.operationId);
    if (record.recordKind === 'operation-end' && typeof record.operationId === 'string') closed.add(record.operationId);
  }
  // An operation that started and never ended is unfinished work. Its cost is
  // still counted; the summary only refuses to call the run complete.
  for (const id of opened) if (!closed.has(id)) totals.incomplete = true;

  const summary: TraceSummary = { ...totals, projectId: options.projectId, runId: options.runId, records: records.length };
  if (options.knownSpendUsd !== undefined) {
    // `aggregateUsd` is a subset of the total, so it is not added again here.
    summary.reconciliationUsd = round(summary.attributableUsd - options.knownSpendUsd);
  }
  return summary;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** One operation's observed interval, when both ends were seen. */
interface Interval {
  operationId: string;
  kind: string;
  from: number;
  to: number;
}

/**
 * The observed intervals of every operation that both started and ended.
 * An operation with children is excluded from active time: a parent's interval
 * spans the gaps between its children, and counting it would report idle time
 * as work.
 */
function observedIntervals(records: readonly JournalRecord[]): Interval[] {
  const open = new Map<string, { kind: string; from: number }>();
  const hasChildren = new Set<string>();
  for (const record of records) {
    // Only an operation is a child. A charge names its operation as parent too,
    // and counting it would make every charged operation look like a parent.
    if (record.recordKind === 'operation-start' && typeof record.parentOperationId === 'string') hasChildren.add(record.parentOperationId);
  }
  const intervals: Interval[] = [];
  for (const record of records) {
    const id = typeof record.operationId === 'string' ? record.operationId : undefined;
    if (!id || typeof record.at !== 'string') continue;
    const at = Date.parse(record.at);
    if (record.recordKind === 'operation-start') {
      open.set(id, { kind: String(record.operationKind ?? 'auxiliary'), from: at });
      continue;
    }
    if (record.recordKind !== 'operation-end') continue;
    const started = open.get(id);
    if (!started) continue;
    open.delete(id);
    if (hasChildren.has(id)) continue;
    intervals.push({ operationId: id, kind: started.kind, from: started.from, to: at });
  }
  return [...intervals, ...delegatedIntervals(records)].filter((interval) => interval.to >= interval.from);
}

/**
 * Working time a delegated Room or Workflow reported, one interval per rise.
 * The rise is known only when it is read, so it is placed as the time that
 * ended at the reading. Overlap with the Architect's own operations then
 * counts once in the union.
 */
function delegatedIntervals(records: readonly JournalRecord[]): Interval[] {
  // Never before the run's first record, so Active cannot exceed Elapsed.
  const first = Math.min(...records.map((record) => Date.parse(record.at)).filter(Number.isFinite));
  const intervals: Interval[] = [];
  for (const record of records) {
    if (record.kind !== 'usage' || typeof record.activeMs !== 'number' || record.activeMs <= 0) continue;
    const to = Date.parse(record.at);
    if (!Number.isFinite(to)) continue;
    intervals.push({ operationId: `delegated:${record.seq}`, kind: 'delegated', from: Math.max(first, to - record.activeMs), to });
  }
  return intervals;
}

export interface TimingSummary {
  /** Union of observed active intervals. Overlapping work counts once. */
  activeMs: number;
  /** Sum of observed worker-unit durations. Parallel work counts more than once. */
  workerMs: number;
  /** Sum of observed wait intervals, by cause. Never inferred. */
  waitMs: number;
  waitByCause: Record<string, number>;
  /**
   * Causes of waits that have started and not ended in the whole folded
   * history. A page shows a slice, so only this says what is waiting now.
   */
  openWaits: string[];
}

/**
 * Timing from observed intervals only.
 *
 * Active time is a union: two workers over the same ten minutes contribute ten
 * minutes, not twenty. Summed worker time is reported separately, because it is
 * a different question and must never be labelled active time.
 */
export function summarizeTiming(records: readonly JournalRecord[]): TimingSummary {
  const intervals = observedIntervals(records);
  const work = intervals.filter((interval) => interval.kind !== 'wait');
  const waits = intervals.filter((interval) => interval.kind === 'wait');

  const sorted = [...work].sort((a, b) => a.from - b.from);
  let activeMs = 0;
  let cursor: { from: number; to: number } | null = null;
  for (const interval of sorted) {
    if (!cursor || interval.from > cursor.to) {
      if (cursor) activeMs += cursor.to - cursor.from;
      cursor = { from: interval.from, to: interval.to };
    } else {
      cursor.to = Math.max(cursor.to, interval.to);
    }
  }
  if (cursor) activeMs += cursor.to - cursor.from;

  const workerMs = work
    .filter((interval) => WORKER_KINDS.has(interval.kind))
    .reduce((total, interval) => total + (interval.to - interval.from), 0);

  const waitByCause: Record<string, number> = {};
  let waitMs = 0;
  const waitCauses = new Map(
    records
      .filter((record) => typeof record.operationId === 'string' && typeof record.waitCause === 'string')
      .map((record) => [String(record.operationId), String(record.waitCause)]),
  );
  for (const wait of waits) {
    const duration = wait.to - wait.from;
    waitMs += duration;
    const cause = waitCauses.get(wait.operationId) ?? 'unobserved';
    waitByCause[cause] = (waitByCause[cause] ?? 0) + duration;
  }

  const ended = new Set(records
    .filter((record) => record.recordKind === 'operation-end' && typeof record.operationId === 'string')
    .map((record) => String(record.operationId)));
  const openWaits = [...new Set(records
    .filter((record) => record.recordKind === 'operation-start' && typeof record.waitCause === 'string'
      && typeof record.operationId === 'string' && !ended.has(String(record.operationId)))
    .map((record) => String(record.waitCause)))];

  return { activeMs, workerMs, waitMs, waitByCause, openWaits };
}

/** Operations that represent a worker doing work, as opposed to waiting or grouping. */
const WORKER_KINDS = new Set(['workflow-step', 'workflow-attempt', 'room-member', 'research', 'repair', 'evaluation', 'evidence', 'delegated']);

export interface TokenComposition {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Counters no record reported. A reader shows these as unavailable, not zero. */
  unavailable: string[];
}

/**
 * Token composition over disjoint categories.
 *
 * Reasoning tokens are excluded: providers report them as a subset of output,
 * so including them would double-count. A category nothing reported is listed
 * as unavailable rather than summed to zero.
 */
export function tokenComposition(records: readonly JournalRecord[]): TokenComposition {
  const composition: TokenComposition = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, unavailable: [] };
  const seen = new Set<string>();
  for (const record of records) {
    const usage = isUsage(record.usage) ? record.usage : undefined;
    if (!usage) continue;
    for (const [field, key] of [
      ['inputTokens', 'input'], ['outputTokens', 'output'],
      ['cacheReadTokens', 'cacheRead'], ['cacheWriteTokens', 'cacheWrite'],
    ] as const) {
      const value = usage[field];
      if (typeof value === 'number') {
        composition[key] += value;
        seen.add(key);
      }
    }
  }
  composition.unavailable = ['input', 'output', 'cacheRead', 'cacheWrite'].filter((key) => !seen.has(key));
  return composition;
}

export interface ConfigurationProvenance {
  operationId: string;
  model?: string;
  thinking?: string;
  source?: string;
  /** The configuration revision this operation resolved against, when recorded. */
  revision?: number;
}

/** Which model settings each operation actually used, and where they came from. */
export function configurationProvenance(records: readonly JournalRecord[]): ConfigurationProvenance[] {
  const byOperation = new Map<string, ConfigurationProvenance>();
  for (const record of records) {
    if (record.recordKind !== 'operation-start') continue;
    const id = typeof record.operationId === 'string' ? record.operationId : undefined;
    if (!id) continue;
    const entry: ConfigurationProvenance = { operationId: id };
    if (typeof record.model === 'string') entry.model = record.model;
    if (typeof record.thinking === 'string') entry.thinking = record.thinking;
    if (typeof record.source === 'string') entry.source = record.source;
    if (typeof record.configRevision === 'number') entry.revision = record.configRevision;
    byOperation.set(id, entry);
  }
  return [...byOperation.values()];
}

/**
 * Inclusive cost of one operation, for inspection only.
 * The caller must not add this to a total that already counts its children.
 */
export function inclusiveCostOf(operationId: string, records: readonly JournalRecord[]): number {
  const children = new Set<string>();
  for (const record of records) {
    if (record.parentOperationId === operationId && typeof record.operationId === 'string') children.add(record.operationId);
  }
  let total = 0;
  for (const record of records) {
    const isSelf = record.operationId === operationId;
    const isChild = typeof record.operationId === 'string' && children.has(record.operationId);
    if (!isSelf && !isChild) continue;
    if (record.kind !== 'usage') continue;
    if (typeof record.costUsd === 'number') total += record.costUsd;
  }
  return total;
}

/** A summary kept for compatibility with the run-journal checkpoint stores. */
export type TraceCheckpoint = RunSummary;

/**
 * What a record written before run identity can honestly support.
 *
 * The amounts are the ones the record kept; nothing is reconstructed. A missing
 * call trace stays missing, and every gap the record named is carried forward
 * rather than being smoothed into a total that looks complete.
 */
export interface LegacyTraceSummary {
  projectId: string;
  /** The lifetime amount the record kept, untouched. */
  attributableUsd: number;
  /** The same amount, labelled as a bare total with no call detail. */
  aggregateUsd: number;
  hasAggregate: true;
  incomplete: true;
  /** Why the record itself said its accounting was incomplete. */
  incompleteSources: string[];
  /** The record's own source split, preserved as recorded. */
  sources: { owner: number; research: number; dispatched: number };
  /** Sessions a later grant replaced. Their charges are already in the total. */
  previousSessions: number;
  /** Measurements this record shape cannot support. Never shown as zero. */
  unavailable: string[];
}

/**
 * Reads a legacy record into a partial summary.
 *
 * It never alters the record and never invents the calls behind a total. Timing,
 * per-call cost, cache splits and attribution are unavailable for a record that
 * kept none of them, and the summary says so instead of implying zero.
 */
export function summarizeLegacyRecord(record: {
  id: string;
  budget: {
    /** Accepted but unused: the summary reports the amount, not the ceiling. */
    capUsd?: number | null;
    spentUsd: number;
    incomplete?: boolean;
    incompleteSources?: string[];
    sources: { owner: number; research: number; dispatched: number };
  };
  session?: { previousSessions?: unknown[] };
  runs?: unknown[];
}): LegacyTraceSummary | null {
  // A record that already carries runs is summarized from its journal instead.
  if (record.runs && record.runs.length > 0) return null;
  return {
    projectId: record.id,
    attributableUsd: record.budget.spentUsd,
    aggregateUsd: record.budget.spentUsd,
    hasAggregate: true,
    incomplete: true,
    incompleteSources: record.budget.incompleteSources ?? [],
    sources: { ...record.budget.sources },
    previousSessions: record.session?.previousSessions?.length ?? 0,
    unavailable: ['timing', 'per-call-cost', 'cache-split', 'run-attribution'],
  };
}
