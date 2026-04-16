/**
 * IPC bridge for Sero mode.
 *
 * Uses a globalThis EventEmitter to coordinate between the Pi extension
 * (which runs in the Electron main process) and the IPC handler
 * (which bridges to the renderer).
 *
 * This module is only used when ctx.hasUI === false (Sero SDK mode).
 * In Pi CLI mode, the extension uses ctx.ui.custom() instead.
 */

import {
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getUserFeedbackAnswerEvent,
  type UserFeedbackCancelPayload,
} from '@sero/common';
import type { PendingQuestion, QuestionResponse } from '../shared/types';
import { getUserFeedbackBus } from '../shared/emitter';

/**
 * Check if Sero's IPC bridge is active.
 *
 * When the Electron IPC handler registers (registerUserFeedbackQuestionHandlers),
 * it adds a listener for 'question-request' on the shared bus.
 * In Pi CLI mode, no such listener exists.
 */
export function hasSeroIPCBridge(): boolean {
  const bus = getUserFeedbackBus();
  return bus.listenerCount(USER_FEEDBACK_QUESTION_REQUEST_EVENT) > 0;
}

let questionCounter = 0;

/** Generate a unique question ID. */
export function nextQuestionId(): string {
  return `ufq-${Date.now()}-${++questionCounter}`;
}

/**
 * Send a question to the Sero renderer and wait for the user's response.
 *
 * The IPC handler (electron/ipc/user-feedback-questions.ts) listens for
 * 'question-request' events and forwards them to the renderer. When the
 * renderer answers, the IPC handler emits 'answer:<id>' back here.
 */
export async function askQuestion(
  pending: PendingQuestion,
  signal?: AbortSignal,
): Promise<QuestionResponse> {
  const bus = getUserFeedbackBus();

  return new Promise<QuestionResponse>((resolve) => {
    const answerId = getUserFeedbackAnswerEvent(pending.id);

    const onAnswer = (response: QuestionResponse) => {
      cleanup();
      resolve(response);
    };

    const onAbort = () => {
      cleanup();
      // Notify renderer that the question was cancelled
      bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id: pending.id } satisfies UserFeedbackCancelPayload);
      resolve({ id: pending.id, answers: [], cancelled: true });
    };

    const cleanup = () => {
      bus.removeListener(answerId, onAnswer);
      signal?.removeEventListener('abort', onAbort);
    };

    bus.once(answerId, onAnswer);

    if (signal) {
      if (signal.aborted) {
        cleanup();
        bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id: pending.id } satisfies UserFeedbackCancelPayload);
        resolve({ id: pending.id, answers: [], cancelled: true });
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // Send the question to the renderer via the IPC bridge
    bus.emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, pending);
  });
}
