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

import type { ObservationOperationKind, ObservationOutcome, ObservationUsage } from '@sero-ai/common';

import type { RunJournal, AppendInput } from './run-journal';

export interface OpenSpanInput {
  projectId: string;
  runId: string;
  operationId: string;
  kind: ObservationOperationKind;
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
}

export interface SpanRecorderDeps {
  journal: RunJournal;
  now(): string;
}

export function createSpanRecorder(deps: SpanRecorderDeps): SpanRecorder {
  const { journal, now } = deps;

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

    async around(input, work) {
      await this.open(input);
      try {
        const value = await work();
        await this.close({ projectId: input.projectId, runId: input.runId, operationId: input.operationId, outcome: 'ok' });
        return value;
      } catch (error) {
        await this.close({
          projectId: input.projectId,
          runId: input.runId,
          operationId: input.operationId,
          outcome: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
        throw error;
      }
    },
  };
}
