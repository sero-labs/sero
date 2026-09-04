/**
 * Choice bridge — carries pending questions to gateway clients and
 * carries their answers back.
 *
 * Questions travel on the `__seroUserFeedbackBus`. The desktop window and
 * this bridge both listen, so a choice appears in both places and the
 * first answer wins. An answer from a phone is emitted on the same bus in
 * the same shape the desktop renderer uses, so the plugin runtime cannot
 * tell the two apart.
 */

import {
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getUserFeedbackAnswerEvent,
  type UserFeedbackCancelPayload,
} from '@sero-ai/common';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from '@/types/ipc';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';
import type {
  GatewayChoiceRequestEvent,
  GatewayChoiceResolvedEvent,
  GatewayPushEvent,
} from '../server/protocol-events';

/** What the bridge needs from the gateway to reach clients. */
export interface ChoiceEventSink {
  broadcastWorkspaceEvent(workspaceId: string, event: GatewayPushEvent): void;
  broadcastOwnerEvent(event: GatewayPushEvent): void;
}

/** Why an answer could not be applied. */
export type AnswerChoiceFailure = 'unknown' | 'forbidden' | 'invalid_option';

export interface AnswerChoiceResult {
  ok: boolean;
  reason?: AnswerChoiceFailure;
}

interface PendingChoice {
  event: GatewayChoiceRequestEvent;
  /** The question item the options came from, needed to build the answer. */
  questionId: string;
  /** Removes this bridge's own listener for the answer. */
  detach: () => void;
}

const pending = new Map<string, PendingChoice>();

let sink: ChoiceEventSink | null = null;
/** This bridge's own bus listeners, so a reset removes only these. */
let busListeners: Array<[string, (...args: unknown[]) => void]> = [];

/**
 * A question this bridge can forward.
 *
 * One question with a fixed option list is the whole of `requestChoice`.
 * A multi-question interview needs a form, which a push event cannot
 * carry, so it stays on the desktop.
 */
function toChoiceEvent(question: UserFeedbackPendingQuestion): GatewayChoiceRequestEvent | null {
  if (question.questions.length !== 1) return null;
  const item = question.questions[0];
  if (item.options.length === 0) return null;

  return {
    type: 'choice_request',
    id: question.id,
    workspaceId: question.context?.workspaceId,
    title: item.label,
    body: item.prompt,
    options: item.options.map((option) => ({
      id: option.value,
      label: option.label,
      description: option.description,
    })),
    expiresAt: question.expiresAt,
    fallbackLabel: question.fallbackLabel,
    source: question.context?.source,
    ts: Date.now(),
  };
}

/** Send an event to the clients allowed to see this choice. */
function fanout(event: GatewayPushEvent, workspaceId: string | undefined): void {
  if (!sink) return;
  // A choice that names no workspace cannot be scoped, so only an owner
  // token sees it.
  if (workspaceId) sink.broadcastWorkspaceEvent(workspaceId, event);
  else sink.broadcastOwnerEvent(event);
}

function resolved(
  choice: PendingChoice,
  outcome: GatewayChoiceResolvedEvent['outcome'],
  optionId?: string,
): void {
  pending.delete(choice.event.id);
  choice.detach();

  fanout(
    {
      type: 'choice_resolved',
      id: choice.event.id,
      workspaceId: choice.event.workspaceId,
      outcome,
      optionId,
      ts: Date.now(),
    },
    choice.event.workspaceId,
  );
}

/** Start forwarding questions. Safe to call more than once. */
export function registerGatewayChoiceBridge(eventSink: ChoiceEventSink): void {
  sink = eventSink;
  if (busListeners.length > 0) return;

  const bus = getUserFeedbackBus();

  const onQuestion = (question: UserFeedbackPendingQuestion) => {
    const event = toChoiceEvent(question);
    if (!event) return;

    const answerEvent = getUserFeedbackAnswerEvent(question.id);

    // Someone else answered — the desktop window, or another client.
    // Listening here is how this bridge learns to dismiss the card.
    const onAnswer = (response: UserFeedbackResponse) => {
      const choice = pending.get(question.id);
      if (!choice) return;
      const answered = !response.cancelled && response.answers.length > 0;
      resolved(
        choice,
        answered ? 'answered' : 'cancelled',
        answered ? String(response.answers[0].value) : undefined,
      );
    };

    bus.on(answerEvent, onAnswer);

    pending.set(question.id, {
      event,
      questionId: question.questions[0].id,
      detach: () => bus.removeListener(answerEvent, onAnswer),
    });

    fanout(event, event.workspaceId);
  };

  const onCancel = (payload: UserFeedbackCancelPayload) => {
    const choice = pending.get(payload.id);
    if (!choice) return;
    resolved(choice, 'cancelled');
  };

  bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, onQuestion);
  bus.on(USER_FEEDBACK_QUESTION_CANCEL_EVENT, onCancel);
  busListeners = [
    [USER_FEEDBACK_QUESTION_REQUEST_EVENT, onQuestion as (...args: unknown[]) => void],
    [USER_FEEDBACK_QUESTION_CANCEL_EVENT, onCancel as (...args: unknown[]) => void],
  ];
}

/**
 * Answer a pending choice on behalf of a gateway client.
 *
 * `canReach` decides whether this client's token covers the choice. A
 * choice that names no workspace is answerable by owner tokens only.
 */
export function answerChoice(
  id: string,
  optionId: string,
  canReach: (workspaceId: string | null) => boolean,
): AnswerChoiceResult {
  const choice = pending.get(id);
  // Answered already, timed out, or never existed. The client cannot tell
  // these apart, and neither answer would be applied.
  if (!choice) return { ok: false, reason: 'unknown' };

  if (!canReach(choice.event.workspaceId ?? null)) {
    return { ok: false, reason: 'forbidden' };
  }

  const option = choice.event.options.find((candidate) => candidate.id === optionId);
  if (!option) return { ok: false, reason: 'invalid_option' };

  const response: UserFeedbackResponse = {
    id,
    answers: [
      {
        questionId: choice.questionId,
        value: option.id,
        label: option.label,
        wasCustom: false,
      },
    ],
    cancelled: false,
  };

  const bus = getUserFeedbackBus();
  // The answer first, so the waiting caller resolves. Then the cancel,
  // which is what makes the desktop window dismiss its card.
  bus.emit(getUserFeedbackAnswerEvent(id), response);
  bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id });

  return { ok: true };
}

/** Pending choices a token can see. Used to fill a client on connect. */
export function pendingChoicesFor(
  canReach: (workspaceId: string | null) => boolean,
): GatewayChoiceRequestEvent[] {
  return [...pending.values()]
    .filter((choice) => canReach(choice.event.workspaceId ?? null))
    .map((choice) => choice.event);
}

/** Test seam. Drops every pending choice and this bridge's listeners. */
export function resetChoiceBridge(): void {
  for (const choice of pending.values()) choice.detach();
  pending.clear();
  sink = null;

  const bus = getUserFeedbackBus();
  for (const [event, listener] of busListeners) bus.removeListener(event, listener);
  busListeners = [];
}
