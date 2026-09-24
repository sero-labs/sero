/**
 * The trace client (spec architect-run-observability).
 *
 * The runtime answers with metadata only and refuses anything it does not
 * recognise, so this side parses rather than trusts: a field that is not the
 * shape it should be is dropped, not coerced. Defaults are honest too. A number
 * that was never reported stays absent rather than becoming zero, because the
 * inspector must be able to say "not measured" and not only "measured as none".
 */

import type { AppToolResult } from '@sero-ai/app-runtime';

export interface TraceRecord {
  seq: number;
  at: string;
  kind: string;
  source?: string;
  operationId?: string;
  operationKind?: string;
  recordKind?: string;
  parentOperationId?: string;
  model?: string;
  thinking?: string;
  outcome?: string;
  waitCause?: string;
  costUsd?: number;
  coverage?: 'call' | 'aggregate';
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  /** The activity node a charge sits under, and its name. Charges only. */
  nodeId?: string;
  label?: string;
}

export const ACTIVITY_GROUPS = ['owner', 'research', 'planning', 'rooms', 'workflows', 'evaluation', 'repair', 'waits', 'unassigned'] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];
export type ActivityState = 'done' | 'running' | 'waiting' | 'failed' | 'aborted' | 'unknown';

export interface TokenSet { input: number; output: number; cacheRead: number; cacheWrite: number }

/** One named row of the activity tree, as the runtime folded it. */
export interface ActivityNodeView {
  id: string;
  parentId: string | null;
  label: string;
  kind: string;
  group: ActivityGroup;
  synthetic: boolean;
  rawId: string;
  startAt: string | null;
  endAt: string | null;
  state: ActivityState;
  retries: number;
  costUsd: number | null;
  ownCostUsd: number | null;
  charges: number;
  model?: string;
  thinking?: string;
  tokens: TokenSet | null;
  coverage: 'call' | 'aggregate' | 'partial' | null;
  waitCause?: string;
  error?: string;
}

export interface ActivityView {
  nodes: ActivityNodeView[];
  spend: { at: string; usd: number }[];
  byGroup: { group: ActivityGroup; usd: number; tokens: TokenSet | null }[];
  byModel: { model: string | null; usd: number }[];
  counters: { ownerTurns: number; failures: number; retries: number; waits: number };
  elapsed: { from: string; to: string } | null;
}

export interface LifetimeRunView {
  id: string;
  label: string;
  kind: string;
  outcome: string;
  open: boolean;
  recorded: boolean;
  attributableUsd: number;
  linkedSharedUsd: number;
  activeMs: number;
  waitMs: number;
  incomplete: boolean;
  spend: { at: string; usd: number }[];
}

export interface LifetimeView {
  runs: LifetimeRunView[];
  sharedUsd: number;
  unassignedUsd: number | null;
}

export interface TraceSummaryView {
  attributableUsd: number;
  aggregateUsd: number;
  hasAggregate: boolean;
  /** Charges with no price: work at an unknown cost. */
  unpricedCharges: number;
  /** False means no record reported tokens, so token figures are unavailable. */
  tokensMeasured: boolean;
  incomplete: boolean;
  requests: number;
  toolCalls: number;
  retries: number;
  compactions: number;
  errors: number;
  /** Present only when the caller supplied project spend to compare against. */
  reconciliationUsd?: number;
}

export interface TraceTimingView {
  activeMs: number;
  workerMs: number;
  waitMs: number;
  waitByCause: Record<string, number>;
  /** Causes of waits that started and have not ended across the whole folded history. */
  openWaits: string[];
}

export interface TraceTokensView {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Counters nothing reported. Shown as unavailable, never as zero. */
  unavailable: string[];
}

export interface TracePage {
  /** False when the runtime found no journal for this view: nothing was ever written. */
  recorded: boolean;
  summary: TraceSummaryView;
  timing: TraceTimingView;
  tokens: TraceTokensView;
  records: TraceRecord[];
  nextAfterSeq: number | null;
  incomplete: boolean;
  activity: ActivityView;
  /** Shared activity linked to this run, counted once in lifetime totals and never in the run's. */
  linkedSharedUsd: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const maybeNum = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const STATES: readonly ActivityState[] = ['done', 'running', 'waiting', 'failed', 'aborted', 'unknown'];
const group = (value: unknown): ActivityGroup => (ACTIVITY_GROUPS as readonly unknown[]).includes(value) ? value as ActivityGroup : 'unassigned';

function readTokens(raw: unknown): TokenSet | null {
  if (!isObject(raw)) return null;
  return { input: num(raw.input), output: num(raw.output), cacheRead: num(raw.cacheRead), cacheWrite: num(raw.cacheWrite) };
}

function readSpend(raw: unknown): { at: string; usd: number }[] {
  return list(raw).flatMap((point) => (isObject(point) && typeof point.at === 'string' && typeof point.usd === 'number' ? [{ at: point.at, usd: point.usd }] : []));
}

function readNode(raw: unknown): ActivityNodeView | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.label !== 'string') return null;
  const coverage = raw.coverage === 'call' || raw.coverage === 'aggregate' || raw.coverage === 'partial' ? raw.coverage : null;
  const node: ActivityNodeView = {
    id: raw.id,
    parentId: text(raw.parentId) ?? null,
    label: raw.label,
    kind: text(raw.kind) ?? 'unassigned',
    group: group(raw.group),
    synthetic: raw.synthetic === true,
    rawId: text(raw.rawId) ?? raw.id,
    startAt: text(raw.startAt) ?? null,
    endAt: text(raw.endAt) ?? null,
    state: STATES.includes(raw.state as ActivityState) ? raw.state as ActivityState : 'unknown',
    retries: num(raw.retries),
    // A cost the runtime did not price stays null, never zero.
    costUsd: maybeNum(raw.costUsd) ?? null,
    ownCostUsd: maybeNum(raw.ownCostUsd) ?? null,
    charges: num(raw.charges),
    tokens: readTokens(raw.tokens),
    coverage,
  };
  for (const key of ['model', 'thinking', 'waitCause', 'error'] as const) {
    const value = text(raw[key]);
    if (value) node[key] = value;
  }
  return node;
}

/** The activity tree and chart series. An older runtime without one reads as empty. */
export function readActivity(raw: unknown): ActivityView {
  const value = isObject(raw) ? raw : {};
  const counters = isObject(value.counters) ? value.counters : {};
  const elapsed = isObject(value.elapsed) && typeof value.elapsed.from === 'string' && typeof value.elapsed.to === 'string'
    ? { from: value.elapsed.from, to: value.elapsed.to } : null;
  return {
    nodes: list(value.nodes).map(readNode).filter((node): node is ActivityNodeView => node !== null),
    spend: readSpend(value.spend),
    byGroup: list(value.byGroup).flatMap((row) => (isObject(row) && typeof row.usd === 'number' ? [{ group: group(row.group), usd: row.usd, tokens: readTokens(row.tokens) }] : [])),
    byModel: list(value.byModel).flatMap((row) => (isObject(row) && typeof row.usd === 'number' ? [{ model: text(row.model) ?? null, usd: row.usd }] : [])),
    counters: { ownerTurns: num(counters.ownerTurns), failures: num(counters.failures), retries: num(counters.retries), waits: num(counters.waits) },
    elapsed,
  };
}

/** Reads a lifetime answer, or null when the answer is not one. */
export function readLifetime(result: AppToolResult): LifetimeView | null {
  const details = result.details;
  if (!isObject(details) || details.ok === false || !isObject(details.lifetime)) return null;
  const raw = details.lifetime;
  return {
    runs: list(raw.runs).flatMap((run) => (isObject(run) && typeof run.id === 'string' ? [{
      id: run.id,
      label: text(run.label) ?? run.id,
      kind: text(run.kind) ?? 'initial',
      outcome: text(run.outcome) ?? 'in-progress',
      open: run.open === true,
      recorded: run.recorded === true,
      attributableUsd: num(run.attributableUsd),
      linkedSharedUsd: num(run.linkedSharedUsd),
      activeMs: num(run.activeMs),
      waitMs: num(run.waitMs),
      incomplete: run.incomplete !== false,
      spend: readSpend(run.spend),
    }] : [])),
    sharedUsd: num(raw.sharedUsd),
    unassignedUsd: maybeNum(raw.unassignedUsd) ?? null,
  };
}

function readRecord(raw: unknown): TraceRecord | null {
  if (!isObject(raw)) return null;
  if (typeof raw.seq !== 'number' || typeof raw.at !== 'string' || typeof raw.kind !== 'string') return null;
  const usage = isObject(raw.usage) ? raw.usage : undefined;
  const coverage = raw.coverage === 'call' || raw.coverage === 'aggregate' ? raw.coverage : undefined;
  const record: TraceRecord = { seq: raw.seq, at: raw.at, kind: raw.kind };
  for (const [key, value] of Object.entries({
    source: text(raw.source),
    operationId: text(raw.operationId),
    operationKind: text(raw.operationKind),
    recordKind: text(raw.recordKind),
    parentOperationId: text(raw.parentOperationId),
    model: text(raw.model),
    thinking: text(raw.thinking),
    outcome: text(raw.outcome),
    waitCause: text(raw.waitCause),
    costUsd: maybeNum(raw.costUsd),
    coverage,
    nodeId: text(raw.nodeId),
    label: text(raw.label),
  })) {
    if (value !== undefined) Object.assign(record, { [key]: value });
  }
  if (usage) {
    record.usage = {
      inputTokens: maybeNum(usage.inputTokens),
      outputTokens: maybeNum(usage.outputTokens),
      cacheReadTokens: maybeNum(usage.cacheReadTokens),
      cacheWriteTokens: maybeNum(usage.cacheWriteTokens),
    };
  }
  return record;
}

/** Reads a tool answer into a page, or null when the answer is not one. */
export function readTracePage(result: AppToolResult): TracePage | null {
  const details = result.details;
  if (!isObject(details) || details.ok === false) return null;
  const summaryRaw = isObject(details.summary) ? details.summary : null;
  if (!summaryRaw) return null;
  const timing = isObject(details.timing) ? details.timing : {};
  const tokens = isObject(details.tokens) ? details.tokens : {};
  const records = Array.isArray(details.records)
    ? details.records.map(readRecord).filter((entry): entry is TraceRecord => entry !== null)
    : [];

  return {
    // Only an explicit "no" means nothing was recorded. An older runtime that
    // does not say is trusted to have a journal behind its numbers.
    recorded: details.recorded !== false,
    summary: {
      attributableUsd: num(summaryRaw.attributableUsd),
      aggregateUsd: num(summaryRaw.aggregateUsd),
      hasAggregate: summaryRaw.hasAggregate === true,
      unpricedCharges: num(summaryRaw.unpricedCharges),
      tokensMeasured: summaryRaw.tokensMeasured === true,
      // A summary that folded a bound reports itself incomplete. The default is
      // incomplete, so an unreadable flag is never read as "everything is here".
      incomplete: summaryRaw.incomplete !== false,
      requests: num(summaryRaw.requests),
      toolCalls: num(summaryRaw.toolCalls),
      retries: num(summaryRaw.retries),
      compactions: num(summaryRaw.compactions),
      errors: num(summaryRaw.errors),
      reconciliationUsd: maybeNum(summaryRaw.reconciliationUsd),
    },
    timing: {
      activeMs: num(timing.activeMs),
      workerMs: num(timing.workerMs),
      waitMs: num(timing.waitMs),
      waitByCause: isObject(timing.waitByCause)
        ? Object.fromEntries(Object.entries(timing.waitByCause).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
        : {},
      openWaits: Array.isArray(timing.openWaits) ? timing.openWaits.filter((entry): entry is string => typeof entry === 'string') : [],
    },
    tokens: {
      input: num(tokens.input),
      output: num(tokens.output),
      cacheRead: num(tokens.cacheRead),
      cacheWrite: num(tokens.cacheWrite),
      unavailable: Array.isArray(tokens.unavailable) ? tokens.unavailable.filter((entry): entry is string => typeof entry === 'string') : [],
    },
    records,
    nextAfterSeq: maybeNum(details.nextAfterSeq) ?? null,
    incomplete: details.incomplete === true,
    activity: readActivity(details.activity),
    linkedSharedUsd: num(details.linkedSharedUsd),
  };
}

/**
 * Combines a continuation page onto what was already read.
 *
 * Records are kept once each by sequence number, so re-reading the same page
 * twice never duplicates a row. The newer answer's summary, timing, tokens,
 * next cursor and incomplete flag replace the previous ones, since the
 * runtime recomputes those for the whole run on every read rather than only
 * for the slice of records a continuation asked for.
 */
export function appendTracePage(previous: TracePage, addition: TracePage): TracePage {
  const seen = new Set(previous.records.map((record) => record.seq));
  const records = [...previous.records, ...addition.records.filter((record) => !seen.has(record.seq))];
  // The fresh answer says whether history continues. When it does, continue
  // from the furthest record already held, not from the fresh page's own end,
  // and a run that had been read to its end reopens when it has grown since.
  const furthest = records.reduce((max, record) => Math.max(max, record.seq), 0);
  const nextAfterSeq = addition.nextAfterSeq === null ? null : Math.max(addition.nextAfterSeq, furthest);
  return { ...addition, records, nextAfterSeq };
}
