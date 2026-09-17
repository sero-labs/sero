/**
 * Inspector aggregations (spec architect-run-observability).
 *
 * Three rules, each of which a chart can get wrong by being convenient.
 *
 * A cost is counted once. A parent's inclusive total already contains its
 * children's, so adding both double-counts; a breakdown sums the leaves and the
 * inclusive figure is shown only for the selected operation, labelled as
 * inclusive.
 *
 * A filtered total says what it covers. A breakdown over a filter is a view of
 * part of the run, so it reports its own scope rather than passing itself off as
 * the run total.
 *
 * A value nobody reported stays absent. A record with no cost contributes
 * nothing, and a chart with no priced records is empty rather than a flat line at
 * zero, because zero is a measurement and "unpriced" is not.
 */

import type { TraceRecord } from './trace';

/** One point on the cumulative spend line. */
export interface SpendPoint {
  at: string;
  /** Spend up to and including this record. */
  cumulativeUsd: number;
}

export interface ActivityTotal {
  activity: string;
  costUsd: number;
  records: number;
  /** Records in this bucket that reported a finite cost. */
  priced: number;
}

export interface ModelTotal {
  model: string;
  thinking: string;
  costUsd: number;
  calls: number;
}

/** Whether a record reported a finite cost, as opposed to one nobody priced. */
const isPriced = (record: TraceRecord): record is TraceRecord & { costUsd: number } =>
  typeof record.costUsd === 'number' && Number.isFinite(record.costUsd);
const costOf = (record: TraceRecord): number => (isPriced(record) ? record.costUsd : 0);

/**
 * Cumulative spend over the records, in time order.
 *
 * Only records that reported a cost produce a point, so the line never draws a
 * step where nothing was priced. An empty result means nothing was priced, which
 * is not the same as spending nothing.
 */
export function cumulativeSpend(records: readonly TraceRecord[]): SpendPoint[] {
  const priced = records
    .filter((record) => typeof record.costUsd === 'number' && Number.isFinite(record.costUsd))
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.seq - b.seq);
  let running = 0;
  return priced.map((record) => {
    running += costOf(record);
    return { at: record.at, cumulativeUsd: running };
  });
}

/** Spend per activity, largest first. */
export function activityBreakdown(records: readonly TraceRecord[]): ActivityTotal[] {
  const totals = new Map<string, ActivityTotal>();
  for (const record of records) {
    const activity = record.operationKind ?? record.source ?? record.kind;
    const entry = totals.get(activity) ?? { activity, costUsd: 0, records: 0, priced: 0 };
    entry.costUsd += costOf(record);
    entry.records += 1;
    if (isPriced(record)) entry.priced += 1;
    totals.set(activity, entry);
  }
  return [...totals.values()].sort((a, b) => b.costUsd - a.costUsd || a.activity.localeCompare(b.activity));
}

/**
 * Spend and call counts per model, with the thinking level it ran at.
 *
 * The pair is the provenance: the same model at two effort levels is two rows,
 * because they are two different decisions and merging them would hide one.
 */
export function modelBreakdown(records: readonly TraceRecord[]): ModelTotal[] {
  const totals = new Map<string, ModelTotal>();
  for (const record of records) {
    if (typeof record.costUsd !== 'number' || !Number.isFinite(record.costUsd)) continue;
    const model = record.model ?? 'not recorded';
    const thinking = record.thinking ?? 'not recorded';
    const key = `${model}@${thinking}`;
    const entry = totals.get(key) ?? { model, thinking, costUsd: 0, calls: 0 };
    entry.costUsd += record.costUsd;
    entry.calls += 1;
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.costUsd - a.costUsd || a.model.localeCompare(b.model));
}

const childrenOf = (record: TraceRecord, records: readonly TraceRecord[]): TraceRecord[] =>
  record.operationId === undefined
    ? []
    : records.filter((candidate) => candidate.parentOperationId === record.operationId);

/** What an operation spent itself, without its descendants. */
export function exclusiveCost(record: TraceRecord, records: readonly TraceRecord[]): number {
  return costOf(record);
}

/** Walks a record and everything under it, each visited once. */
function* subtreeOf(record: TraceRecord, records: readonly TraceRecord[]): Generator<TraceRecord> {
  yield record;
  const seen = new Set<string>([record.operationId ?? `seq:${record.seq}`]);
  const stack = childrenOf(record, records);
  while (stack.length > 0) {
    const next = stack.pop()!;
    const key = next.operationId ?? `seq:${next.seq}`;
    // A record that names the same operation twice is still one cost.
    if (seen.has(key)) continue;
    seen.add(key);
    yield next;
    stack.push(...childrenOf(next, records));
  }
}

/**
 * What an operation and everything under it spent.
 *
 * This is the figure to show for one selected operation, and the one never to add
 * into a total that already counted the children.
 */
export function inclusiveCost(record: TraceRecord, records: readonly TraceRecord[]): number {
  let total = 0;
  for (const entry of subtreeOf(record, records)) total += costOf(entry);
  return total;
}

/**
 * Whether an operation or anything under it reported a finite cost.
 *
 * A tree with nothing priced has an inclusive figure of zero for the same
 * reason a record with no cost has one: the number is not a measurement, so
 * the view must be able to say "not measured" instead of showing it as one.
 */
export function inclusivePriced(record: TraceRecord, records: readonly TraceRecord[]): boolean {
  for (const entry of subtreeOf(record, records)) {
    if (isPriced(entry)) return true;
  }
  return false;
}

export interface Breakdown {
  totals: ActivityTotal[];
  models: ModelTotal[];
  /** True when a filter narrowed this breakdown, so it is not the whole run. */
  filtered: boolean;
}

/**
 * Cost recorded as shared activity.
 *
 * Shared activity belongs to no single run: it is charged once and linked from
 * the runs it served. Reporting it separately is what stops it being read as a
 * run's own attributable cost, and stops a reader adding it to one.
 */
export function sharedCost(records: readonly TraceRecord[]): number {
  return records.filter((record) => record.kind === 'shared').reduce((total, record) => total + costOf(record), 0);
}

/** Cost the records attribute to this scope, which is everything that is not shared. */
export function attributableCost(records: readonly TraceRecord[]): number {
  return records.filter((record) => record.kind !== 'shared').reduce((total, record) => total + costOf(record), 0);
}

/**
 * Cost from usage records that carry no model.
 *
 * A model filter keeps these rather than dropping them, because usage records
 * never carry a model at all; this is what to name when a filtered total
 * includes cost a model filter cannot attribute to any of the models shown.
 */
export function unattributedCost(records: readonly TraceRecord[]): number {
  return records
    .filter((record) => record.kind === 'usage' && record.model === undefined)
    .reduce((total, record) => total + costOf(record), 0);
}

/**
 * The breakdown for a set of records, stating whether it is the whole run.
 *
 * Callers pass the filtered records and the unfiltered count, so the chart can
 * say "3 of 40 rows" instead of presenting a slice as a total.
 */
export function breakdown(records: readonly TraceRecord[], totalRecords: number): Breakdown {
  return {
    totals: activityBreakdown(records),
    models: modelBreakdown(records),
    filtered: records.length !== totalRecords,
  };
}
