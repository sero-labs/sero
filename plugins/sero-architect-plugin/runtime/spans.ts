/**
 * Semantic operation spans (spec architect-run-observability).
 *
 * The runtime, not a model, says what an operation is. Each span opens before
 * its work and closes after it, and both land in the run's journal as
 * metadata-only observations. On top of the observation contract this adds the
 * two things a timeline needs: a stable parent when containment is real, and a
 * link when work hands off between agents.
 *
 * A span that never closes stays open in the journal. That is deliberate: a
 * crash or a Stop must not look like a completed operation.
 */

import type { ObservationOperationKind, ObservationOutcome, ObservationUsage, ObservationWaitCause } from '@sero-ai/common';

import type { RunJournal, AppendInput } from './run-journal';

export interface OpenSpanInput {
  projectId: string;
  runId: string;
  operationId: string;
  kind: ObservationOperationKind;
  /**
   * Why the operation waits. Only `kind: 'wait'` uses it, and only when the
   * runtime observed the cause. An unexplained interval stays unknown.
   */
  waitCause?: ObservationWaitCause;
  /** Set only when containment is real, never to imply a causal path. */
  parentOperationId?: string;
  /** Other operations this one handed work to or received work from. */
  linkedOperationIds?: string[];
  sessionId?: string;
  turnId?: string;
  attemptId?: string;
  requestId?: string;
  toolCallId?: string;
  model?: string;
  thinking?: string;
}

export interface CloseSpanInput {
  projectId: string;
  runId: string;
  operationId: string;
  outcome: ObservationOutcome;
  usage?: ObservationUsage;
  /** Provider or SDK error text. Never a prompt or a payload. */
  error?: string;
}

export interface SpanRecorder {
  open(input: OpenSpanInput): Promise<void>;
  close(input: CloseSpanInput): Promise<void>;
  /**
   * Closes the span with `ok` when the work returns, or with `failed` and the
   * error message when it throws. The error still propagates to the caller.
   */
  around<T>(input: OpenSpanInput, work: () => Promise<T>): Promise<T>;
  /**
   * Records a wait the runtime observed from end to end. Both timestamps are
   * required: a wait whose start or end was not seen is not recorded at all,
   * because a guessed interval is worse than a missing one.
   */
  recordObservedWait(input: ObservedWaitInput): Promise<void>;
}

export interface ObservedWaitInput extends OpenSpanInput {
  kind: 'wait';
  waitCause: ObservationWaitCause;
  /** ISO timestamp the wait began, as the runtime observed it. */
  startedAt: string;
  /** ISO timestamp the wait ended, as the runtime observed it. */
  endedAt: string;
}

export interface SpanRecorderDeps {
  journal: RunJournal;
  now(): string;
  /** Where a failed observation write is reported. Absent means silent. */
  log?(message: string): void;
}

export function createSpanRecorder(deps: SpanRecorderDeps): SpanRecorder {
  const { journal, now } = deps;
  // An observation is a record of the work, never a condition of it. A write
  // that fails is reported here and the journal stays incomplete; the work
  // and its result are unchanged (spec: telemetry failure never changes a run).
  const report = (stage: string, operationId: string, error: unknown): void => {
    try {
      deps.log?.(`observation ${stage} for ${operationId} was not written: ${error instanceof Error ? error.message : String(error)}`);
    } catch {
      // A reporter that fails must not become a second failure of the work.
    }
  };

  return {
    async open(input) {
      const record: AppendInput = {
        kind: 'observation',
        at: now(),
        source: input.kind,
        key: `${input.operationId}:start`,
        operationKind: input.kind,
        operationId: input.operationId,
        recordKind: 'operation-start',
      };
      // Assigned only when present, so an absent identity stays absent rather
      // than arriving as an explicit undefined.
      if (input.parentOperationId) record.parentOperationId = input.parentOperationId;
      if (input.linkedOperationIds?.length) record.linkedOperationIds = input.linkedOperationIds;
      if (input.sessionId) record.sessionId = input.sessionId;
      if (input.turnId) record.turnId = input.turnId;
      if (input.attemptId) record.attemptId = input.attemptId;
      if (input.requestId) record.requestId = input.requestId;
      if (input.toolCallId) record.toolCallId = input.toolCallId;
      if (input.model) record.model = input.model;
      if (input.thinking) record.thinking = input.thinking;
      if (input.waitCause) record.waitCause = input.waitCause;
      await journal.append(input.projectId, input.runId, record);
    },

    async close(input) {
      const record: AppendInput = {
        kind: 'observation',
        at: now(),
        key: `${input.operationId}:end`,
        operationId: input.operationId,
        recordKind: 'operation-end',
        outcome: input.outcome,
      };
      if (input.usage) record.usage = input.usage;
      if (input.error) record.error = input.error;
      await journal.append(input.projectId, input.runId, record);
    },

    async around<T>(input: OpenSpanInput, work: () => Promise<T>): Promise<T> {
      // Neither write is awaited: a slow or hung disk must not delay the work
      // or withhold its result. The journal keeps one writer per file, so the
      // start still lands before the end, and a read waits behind both.
      void this.open(input).catch((error: unknown) => report('open', input.operationId, error));
      let value: T;
      try {
        value = await work();
      } catch (error) {
        void this.close({
          projectId: input.projectId,
          runId: input.runId,
          operationId: input.operationId,
          outcome: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }).catch((closeError: unknown) => report('close', input.operationId, closeError));
        throw error;
      }
      void this.close({ projectId: input.projectId, runId: input.runId, operationId: input.operationId, outcome: 'ok' })
        .catch((error: unknown) => report('close', input.operationId, error));
      return value;
    },

    async recordObservedWait(input) {
      // A wait with no observed end is not a wait: recording it would invent the
      // very duration the inspector is meant to report honestly.
      if (!input.startedAt || !input.endedAt || Date.parse(input.endedAt) < Date.parse(input.startedAt)) return;
      const opened: AppendInput = {
        kind: 'observation',
        at: input.startedAt,
        source: 'wait',
        key: `${input.operationId}:wait`,
        operationKind: 'wait',
        operationId: input.operationId,
        recordKind: 'operation-start',
        waitCause: input.waitCause,
      };
      if (input.parentOperationId) opened.parentOperationId = input.parentOperationId;
      await journal.append(input.projectId, input.runId, opened);
      await journal.append(input.projectId, input.runId, {
        kind: 'observation',
        at: input.endedAt,
        key: `${input.operationId}:wait-end`,
        operationId: input.operationId,
        recordKind: 'operation-end',
        outcome: 'ok',
      });
    },
  };
}
