/**
 * CLI confirmation helper.
 *
 * Bridges CLI commands into the existing user-feedback question UI so an
 * agent-invoked CLI command can pause for explicit user consent before
 * doing something irreversible (e.g. mounting a plugin folder into a
 * workspace).
 *
 * Mechanism: piggybacks on the same `__seroUserFeedbackBus` event bus
 * that the user-feedback Pi extension uses for its `question` tool. The
 * Electron IPC handler at `electron/ipc/platform/ui/user-feedback-questions.ts`
 * listens for `question-request` events and forwards them to the
 * renderer's existing question dialog. When the user answers, the
 * handler emits `answer:<id>` back on the same bus.
 *
 * If no UI bridge is registered (i.e. `question-request` has no
 * listeners) the helper resolves with `bridged: false` so the caller can
 * decide whether to fail safely or fall back to a non-interactive path.
 */

import type { UserFeedbackPendingQuestion, UserFeedbackResponse } from '@/types/ipc';
import {
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getUserFeedbackAnswerEvent,
} from '@sero/common';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';

export interface AskConfirmInput {
  /** Prompt shown to the user above the Yes/No buttons. */
  prompt: string;
  /** Optional label override for the affirmative option. Defaults to "Yes". */
  yesLabel?: string;
  /** Optional label override for the negative option. Defaults to "No". */
  noLabel?: string;
  /** Optional tool-call id for renderer correlation. Defaults to "cli-confirm". */
  toolCallId?: string;
  /** Abort signal — when triggered, the helper resolves as cancelled. */
  signal?: AbortSignal;
}

export interface AskConfirmResult {
  /** True if the renderer's question UI bridge was actually reachable. */
  bridged: boolean;
  /** True if the user explicitly chose the affirmative option. */
  confirmed: boolean;
  /** True if the user cancelled the dialog or the request was aborted. */
  cancelled: boolean;
}

let confirmCounter = 0;

function nextConfirmId(): string {
  return `cli-confirm-${Date.now()}-${++confirmCounter}`;
}

/**
 * Send a yes/no question to the renderer and await the user's answer.
 *
 * Returns immediately with `{ bridged: false }` if no UI bridge is
 * listening, so command handlers can fail with a clear error message
 * instead of hanging forever.
 */
export async function askConfirm(input: AskConfirmInput): Promise<AskConfirmResult> {
  const bus = getUserFeedbackBus();
  if (bus.listenerCount(USER_FEEDBACK_QUESTION_REQUEST_EVENT) === 0) {
    return { bridged: false, confirmed: false, cancelled: false };
  }

  const id = nextConfirmId();
  const yesLabel = input.yesLabel ?? 'Yes';
  const noLabel = input.noLabel ?? 'No';

  const pending: UserFeedbackPendingQuestion = {
    id,
    type: 'question',
    toolCallId: input.toolCallId ?? 'cli-confirm',
    questions: [
      {
        id: 'q0',
        label: 'Confirm',
        prompt: input.prompt,
        options: [
          { value: 'yes', label: yesLabel },
          { value: 'no', label: noLabel },
        ],
        // Keep this strict — confirmation is a yes/no decision, no
        // free-form text answers.
        allowOther: false,
      },
    ],
    timestamp: new Date().toISOString(),
  };

  return new Promise<AskConfirmResult>((resolve) => {
    const answerEvent = getUserFeedbackAnswerEvent(id);

    const cleanup = () => {
      bus.removeListener(answerEvent, onAnswer);
      input.signal?.removeEventListener('abort', onAbort);
    };

    const onAnswer = (response: UserFeedbackResponse) => {
      cleanup();
      if (response.cancelled || response.answers.length === 0) {
        resolve({ bridged: true, confirmed: false, cancelled: true });
        return;
      }
      const answer = response.answers[0];
      const confirmed = answer.value === 'yes';
      resolve({ bridged: true, confirmed, cancelled: false });
    };

    const onAbort = () => {
      cleanup();
      bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id });
      resolve({ bridged: true, confirmed: false, cancelled: true });
    };

    bus.once(answerEvent, onAnswer);

    if (input.signal) {
      if (input.signal.aborted) {
        cleanup();
        bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id });
        resolve({ bridged: true, confirmed: false, cancelled: true });
        return;
      }
      input.signal.addEventListener('abort', onAbort, { once: true });
    }

    bus.emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, pending);
  });
}
