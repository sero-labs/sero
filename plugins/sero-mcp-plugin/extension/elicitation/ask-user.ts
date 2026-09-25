import { EventEmitter } from 'node:events';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackAnswer,
  type UserFeedbackPendingQuestion,
  type UserFeedbackQuestionItem,
  type UserFeedbackResponse,
} from '@sero-ai/common';

function getBus(): EventEmitter {
  return getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => {
    const bus = new EventEmitter();
    bus.setMaxListeners(50);
    return bus;
  });
}

/** False under the plain Pi CLI or in a headless session: nobody can answer. */
export function canAskUser(): boolean {
  return getBus().listenerCount(USER_FEEDBACK_QUESTION_REQUEST_EVENT) > 0;
}

let counter = 0;

/** Asks through the Sero question UI. Resolves with the answers, or `null` when cancelled. */
export function askUser(
  questions: UserFeedbackQuestionItem[],
  options: { source: string; signal?: AbortSignal; type?: 'question' | 'questionnaire' },
): Promise<UserFeedbackAnswer[] | null> {
  const bus = getBus();
  const id = `mcp-input-${Date.now()}-${++counter}`;
  const pending: UserFeedbackPendingQuestion = {
    id,
    type: options.type ?? 'questionnaire',
    toolCallId: id,
    questions,
    timestamp: new Date().toISOString(),
    context: { source: options.source },
  };

  return new Promise((resolve) => {
    const answerEvent = getUserFeedbackAnswerEvent(id);
    const finish = (answers: UserFeedbackAnswer[] | null) => {
      bus.removeListener(answerEvent, onAnswer);
      options.signal?.removeEventListener('abort', onAbort);
      resolve(answers);
    };
    const onAnswer = (response: UserFeedbackResponse) => finish(response.cancelled ? null : response.answers);
    const onAbort = () => {
      bus.emit(USER_FEEDBACK_QUESTION_CANCEL_EVENT, { id });
      finish(null);
    };
    if (options.signal?.aborted) {
      resolve(null);
      return;
    }
    bus.once(answerEvent, onAnswer);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    bus.emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, pending);
  });
}

/** The URL as a web address, or null for any other scheme. */
export function toWebUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Shows the full URL with Decline and Open page. The host opens the page only
 * when the user picks Open page. Resolves null when the question is cancelled.
 */
export async function askToOpenPage(
  webUrl: string,
  options: { serverLabel: string; source: string; prompt?: string; signal?: AbortSignal },
): Promise<'open' | 'decline' | null> {
  const answers = await askUser([{
    id: 'open-page',
    label: `Open a page from ${options.serverLabel}?`,
    prompt: [options.prompt, webUrl].filter(Boolean).join('\n\n'),
    options: [
      { value: 'decline', label: 'Decline', emphasis: 'primary' },
      { value: 'open', label: 'Open page', openUrl: webUrl },
    ],
    allowOther: false,
  }], { source: options.source, signal: options.signal, type: 'question' });
  if (answers === null) return null;
  return answers[0]?.value === 'open' ? 'open' : 'decline';
}
