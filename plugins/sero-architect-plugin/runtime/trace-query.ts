/**
 * Trace queries for the run inspector (spec architect-run-observability).
 *
 * Two rules shape everything here.
 *
 * A journal record is written with an open shape, so a future producer can add a
 * field without changing a type. Reading is the opposite problem: anything not
 * named is not copied, so a prompt, a tool payload or a reasoning block has no
 * route to the renderer even if a producer starts writing one.
 *
 * Detail is opt-in. The summary is what a page shows; the records behind it are
 * only read when a caller asks for them, so opening a project does not read a
 * trace.
 */

import type { ProjectRecord } from '../shared/record';
import { type JournalRecord, type RunJournal } from './run-journal';
import { buildActivity, type ActivityView } from './trace-activity';
import { summarizeTiming, summarizeTrace, tokenComposition, type TraceSummary } from './trace-summary';

/** Keys the inspector reads. Nothing outside this list leaves the runtime. */
const METADATA_KEYS = [
  'source', 'key', 'counter',
  'operationId', 'operationKind', 'recordKind', 'parentOperationId', 'linkedOperationIds',
  'sessionId', 'turnId', 'attemptId', 'requestId', 'toolCallId',
  'outcome', 'model', 'thinking', 'waitCause',
  'costUsd', 'coverage',
] as const;

type MetadataKey = (typeof METADATA_KEYS)[number];

/** One record, reduced to metadata. Every value is a primitive or a name list. */
export type TraceRecordView = {
  seq: number;
  at: string;
  kind: string;
} & Partial<Record<MetadataKey, string | number | boolean | string[]>> & {
  /** Token counters, already flat numbers. */
  usage?: Partial<Record<'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'reasoningTokens', number>>;
  /** The activity node a charge sits under, and that node's name. Charges only. */
  nodeId?: string;
  label?: string;
};

const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The metadata projection of one record.
 *
 * A value that is not a primitive, or a list of strings, is dropped rather than
 * stringified: turning a payload into text to send it is still sending it.
 */
export function toTraceRecordView(record: JournalRecord): TraceRecordView {
  const view: TraceRecordView = { seq: record.seq, at: record.at, kind: record.kind };
  for (const key of METADATA_KEYS) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      view[key] = value;
    } else if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
      view[key] = value;
    }
  }
  if (isObject(record.usage)) {
    const usage: NonNullable<TraceRecordView['usage']> = {};
    for (const field of TOKEN_FIELDS) {
      const value = record.usage[field];
      if (typeof value === 'number') usage[field] = value;
    }
    if (Object.keys(usage).length > 0) view.usage = usage;
  }
  return view;
}

/** The most records one page returns, whatever a caller asks for. */
export const MAX_TRACE_PAGE = 200;
const DEFAULT_TRACE_PAGE = 100;

export interface TraceQuery {
  projectId: string;
  /** A run id, or the project-scoped shared journal. Defaults to the shared journal. */
  journalId?: string;
  /** In detail mode, continue after this sequence. */
  afterSeq?: number;
  limit?: number;
  /**
   * Read the records behind the summary. False by default: a page that shows a
   * summary must not pull a trace to do it.
   */
  detail?: boolean;
  /** The project spend this run's total is reconciled against, when known. */
  knownSpendUsd?: number;
}

export interface TraceAnswer {
  projectId: string;
  journalId: string;
  /**
   * False when this journal has neither a checkpoint nor a record. A project
   * whose work ran before run tracing existed, or one that has not run yet,
   * has nothing to show, and that is not the same as showing zero.
   */
  recorded: boolean;
  summary: TraceSummary;
  timing: ReturnType<typeof summarizeTiming>;
  tokens: ReturnType<typeof tokenComposition>;
  /** Present only in detail mode. */
  records?: TraceRecordView[];
  /** Present only in detail mode; null when this was the last page. */
  nextAfterSeq?: number | null;
  /** Present only in detail mode. */
  incomplete?: boolean;
  /** The named activity tree and chart series, folded from the same records as the summary. */
  activity: ActivityView;
  /**
   * Shared activity linked to this run. It is charged once in lifetime totals,
   * so it is shown beside the run's cost and never added into it.
   */
  linkedSharedUsd: number;
}

export interface TraceQueryDeps {
  journal: RunJournal;
  /**
   * Resolves the project, so a foreign or missing id cannot be read. The
   * record also names the activity: research questions and milestone titles.
   */
  readProject(projectId: string): Promise<ProjectRecord | null>;
}

/**
 * How much history a summary folds before it stops and says so.
 *
 * A summary must not read a whole trace to produce a total, and it must not
 * present a partial total as a complete one. So it folds a bounded prefix and
 * reports `incomplete` when there was more, which is exactly what the reader
 * needs to know.
 */
const SUMMARY_RECORD_LIMIT = 1000;

/** One page's worth of records, folded, plus whether more history exists. */
async function foldBounded(deps: TraceQueryDeps, projectId: string, journalId: string, limit: number):
Promise<{ records: JournalRecord[]; more: boolean; torn: boolean }> {
  const records: JournalRecord[] = [];
  let afterSeq: number | undefined;
  let torn = false;
  for (;;) {
    const page = await deps.journal.readPage(projectId, journalId, {
      afterSeq,
      limit: Math.min(MAX_TRACE_PAGE, limit - records.length),
    });
    records.push(...page.records);
    torn = torn || page.incomplete;
    if (page.nextAfterSeq === null) return { records, more: false, torn };
    if (records.length >= limit) return { records, more: true, torn };
    afterSeq = page.nextAfterSeq;
  }
}

/**
 * Reads a project's trace.
 *
 * Authorization happens before anything is read, so a request for a project
 * that does not exist, or that the caller does not own, returns nothing at all
 * rather than an empty answer that confirms the id.
 */
export async function queryTrace(deps: TraceQueryDeps, query: TraceQuery): Promise<TraceAnswer | null> {
  const project = await deps.readProject(query.projectId);
  if (!project) return null;
  const journalId = query.journalId ?? 'shared';
  // The runtime keeps a checkpoint current, and reading one is a single bounded
  // read. Only a journal that has none is folded, and then only up to the limit.
  const checkpoint = await deps.journal.readSummary(query.projectId, journalId);
  const folded = checkpoint
    ? { records: [] as JournalRecord[], more: false, torn: checkpoint.incomplete }
    : await foldBounded(deps, query.projectId, journalId, SUMMARY_RECORD_LIMIT);

  const recorded = checkpoint !== null || folded.records.length > 0;
  // Spend is only reconciled against a trace that exists: an absent journal
  // would otherwise read as a run that under-reported the whole project.
  const summary = summarizeTrace(folded.records, {
    projectId: query.projectId,
    runId: journalId,
    ...(recorded ? { knownSpendUsd: query.knownSpendUsd } : {}),
  });
  // An open wait is only known from the whole history: a wait that started
  // inside a bounded fold may have ended past it. When the fold was cut short,
  // the answer says nothing is known to be waiting rather than guessing.
  const observed = summarizeTiming(folded.records);
  const timing = folded.more || folded.torn ? { ...observed, openWaits: [] } : observed;
  const tokens = tokenComposition(folded.records);
  const runOpen = (project.runs ?? []).some((run) => run.id === journalId && run.endedAt === null);
  const activity = buildActivity(project, journalId, folded.records, runOpen);
  const shared = journalId === 'shared'
    ? { records: [] as JournalRecord[] }
    : await foldBounded(deps, query.projectId, 'shared', SUMMARY_RECORD_LIMIT);
  const linkedSharedUsd = shared.records
    .filter((record) => record.kind === 'shared' && typeof record.costUsd === 'number' && Array.isArray(record.runIds) && record.runIds.includes(journalId))
    .reduce((sum, record) => sum + (record.costUsd as number), 0);
  const answer: TraceAnswer = {
    projectId: query.projectId,
    journalId,
    recorded,
    // A bounded fold does not cover the whole run, so the answer says so rather
    // than presenting a prefix total as the run's total.
    summary: { ...summary, incomplete: summary.incomplete || folded.more || folded.torn },
    timing,
    tokens,
    activity: activity.view,
    linkedSharedUsd,
  };

  if (query.detail !== true) return answer;

  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_TRACE_PAGE), MAX_TRACE_PAGE);
  const page = await deps.journal.readPage(query.projectId, journalId, {
    afterSeq: query.afterSeq,
    limit,
  });
  return {
    ...answer,
    records: page.records.map((record) => {
      const view = toTraceRecordView(record);
      if (record.kind !== 'usage') return view;
      const nodeId = activity.placeCharge(record);
      return { ...view, nodeId, label: activity.labelOf(nodeId) };
    }),
    nextAfterSeq: page.nextAfterSeq,
    incomplete: page.incomplete,
  };
}
