/**
 * Visible choice notification with a timeout, used by the Orchestrator's
 * dirty-workspace preflight. Reuses the same `__seroUserFeedbackBus` question
 * UI as ask-confirm, presenting the choices as options on a single question.
 *
 * When no UI bridge is reachable, or the user does not answer within
 * `timeoutMs`, it resolves with `{ choiceId: null, timedOut: true }` so the
 * caller can apply its default (create a managed worktree).
 */

import type { UserFeedbackPendingQuestion, UserFeedbackResponse } from '@/types/ipc';
import type { AppRuntimeNotificationChoiceOptions, AppRuntimeNotificationChoiceResult } from '@sero-ai/common';
import {
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getUserFeedbackAnswerEvent,
} from '@sero-ai/common';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';

let choiceCounter = 0;

function nextChoiceId(): string {
  choiceCounter += 1;
  return `orchestrator-choice-${choiceCounter}`;
}

export async function requestChoice(
  options: AppRuntimeNotificationChoiceOptions,
): Promise<AppRuntimeNotificationChoiceResult> {
  const bus = getUserFeedbackBus();
  if (bus.listenerCount(USER_FEEDBACK_QUESTION_REQUEST_EVENT) === 0) {
    return { choiceId: null, timedOut: true };
  }

  const id = nextChoiceId();
  const pending: UserFeedbackPendingQuestion = {
    id,
    type: 'question',
    toolCallId: 'orchestrator-choice',
    questions: [
      {
        id: 'q0',
        label: options.title,
        prompt: options.body,
        options: options.choices.map((choice) => ({
          value: choice.id,
          label: choice.label,
          description: choice.description,
          menu: choice.menu,
          emphasis: choice.emphasis,
        })),
        allowOther: false,
      },
    ],
    timestamp: new Date().toISOString(),
    context: options.context,
    openTarget: options.openTarget,
    expiresAt: new Date(Date.now() + options.timeoutMs).toISOString(),
    fallbackLabel: options.fallbackLabel,
  };

  return new Promise<AppRuntimeNotificationChoiceResult>((resolve) => {
    const answerEvent = getUserFeedbackAnswerEvent(id);
    const timer = setTimeout(() => {
      cleanup();
      bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id });
      resolve({ choiceId: null, timedOut: true });
    }, options.timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      bus.removeListener(answerEvent, onAnswer);
    };

    const onAnswer = (response: UserFeedbackResponse) => {
      cleanup();
      if (response.cancelled || response.answers.length === 0) {
        resolve({ choiceId: null, timedOut: false });
        return;
      }
      resolve({ choiceId: String(response.answers[0].value), timedOut: false });
    };

    bus.once(answerEvent, onAnswer);
    bus.emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, pending);
  });
}
