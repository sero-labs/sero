/**
 * Session events as observations.
 *
 * Split from the runner to keep each file within the 500-LOC limit. The mapping
 * is the interesting part, so it lives on its own where it can be read and
 * tested without a live session.
 *
 * Two rules shape it. An identity is taken from the event when the SDK reports
 * one, and left absent when it does not — a tool call is identified by the SDK's
 * `toolCallId`, so two parallel calls to the same tool never merge, and a request
 * is identified by the message id. And no timing is derived from text deltas:
 * the SDK reports no first-token event, so the caller's clock is the only clock.
 */

import type { ObservationRecord } from '@sero-ai/common';

/** What every observation from one subagent session carries. */
export interface ObservationContext {
  /** The run, which for a subagent is its session. */
  operationId: string;
  /** `provider/id` of the session's model, when it has one. */
  model?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const identities = (context: ObservationContext, extra: Partial<ObservationRecord['identities']> = {}): ObservationRecord['identities'] =>
  ({ operationId: context.operationId, sessionId: context.operationId, ...extra });

/**
 * The observation one session event implies, or null when the event carries none.
 *
 * Only the four events that name a request or a tool are mapped. Text and
 * reasoning deltas are the answer being written, not an observable act.
 */
export function observationForEvent(event: unknown, context: ObservationContext, now: string): ObservationRecord | null {
  if (!isRecord(event) || typeof event.type !== 'string') return null;
  const message = isRecord(event.message) ? event.message : undefined;
  const requestId = typeof message?.id === 'string' ? message.id : undefined;
  const toolCallId = typeof event.toolCallId === 'string' ? event.toolCallId : undefined;

  switch (event.type) {
    case 'message_start':
      return { kind: 'request-start', identities: identities(context, { requestId }), startedAt: now, model: context.model };
    case 'message_end':
      return { kind: 'request-end', identities: identities(context, { requestId }), endedAt: now, model: context.model };
    case 'tool_execution_start':
      return { kind: 'tool-start', identities: identities(context, { toolCallId }), startedAt: now };
    case 'tool_execution_end':
      return { kind: 'tool-end', identities: identities(context, { toolCallId }), endedAt: now, outcome: event.isError === true ? 'failed' : 'ok' };
    default:
      return null;
  }
}

/**
 * One repair pass, which is its own attempt.
 *
 * A repair costs a request and must not be folded into the first reply's timing,
 * so it carries an attempt identity of its own.
 */
export function repairAttemptObservation(
  attempt: number,
  context: ObservationContext,
  phase: 'start' | 'end',
  now: string,
): ObservationRecord {
  const identitiesWithAttempt = identities(context, { attemptId: `${context.operationId}:repair-${attempt}` });
  return phase === 'start'
    ? { kind: 'request-start', identities: identitiesWithAttempt, startedAt: now, model: context.model }
    : { kind: 'request-end', identities: identitiesWithAttempt, endedAt: now, model: context.model };
}
