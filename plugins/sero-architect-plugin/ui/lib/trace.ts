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
}

export interface TraceSummaryView {
  attributableUsd: number;
  aggregateUsd: number;
  hasAggregate: boolean;
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
  summary: TraceSummaryView;
  timing: TraceTimingView;
  tokens: TraceTokensView;
  records: TraceRecord[];
  nextAfterSeq: number | null;
  incomplete: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const maybeNum = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

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
    summary: {
      attributableUsd: num(summaryRaw.attributableUsd),
      aggregateUsd: num(summaryRaw.aggregateUsd),
      hasAggregate: summaryRaw.hasAggregate === true,
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
