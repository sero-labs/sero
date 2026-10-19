/**
 * A permission question waits for the user as long as it takes, so the tool
 * call that asked must not be aborted as stalled while it waits. The question
 * names its tool call; the call's stall timer is held until the question is
 * answered or cancelled.
 */

import {
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  getUserFeedbackAnswerEvent,
  type UserFeedbackCancelPayload,
} from '@sero-ai/common';

import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';
import type { ToolStallWatch } from './abort-grace';

/** Holds a call's stall timer while a question it asked is open. Returns the unsubscribe. */
export function holdWhileAsking(stalls: ToolStallWatch): () => void {
  const bus = getUserFeedbackBus();
  const open = new Map<string, { callId: string; answered: () => void }>();
  const settle = (questionId: string): void => {
    const question = open.get(questionId);
    if (!question) return;
    open.delete(questionId);
    bus.removeListener(getUserFeedbackAnswerEvent(questionId), question.answered);
    stalls.release(question.callId);
  };
  const onQuestion = (pending: { id?: unknown; toolCallId?: unknown }): void => {
    if (typeof pending.id !== 'string' || typeof pending.toolCallId !== 'string') return;
    const questionId = pending.id;
    const answered = (): void => settle(questionId);
    open.set(questionId, { callId: pending.toolCallId, answered });
    bus.once(getUserFeedbackAnswerEvent(questionId), answered);
    stalls.hold(pending.toolCallId);
  };
  const onCancel = (payload: UserFeedbackCancelPayload): void => settle(payload.id);
  bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, onQuestion);
  bus.on(USER_FEEDBACK_QUESTION_CANCEL_EVENT, onCancel);
  return () => {
    bus.removeListener(USER_FEEDBACK_QUESTION_REQUEST_EVENT, onQuestion);
    bus.removeListener(USER_FEEDBACK_QUESTION_CANCEL_EVENT, onCancel);
    for (const [questionId, question] of open) bus.removeListener(getUserFeedbackAnswerEvent(questionId), question.answered);
    open.clear();
  };
}
