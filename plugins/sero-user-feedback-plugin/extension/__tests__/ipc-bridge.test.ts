import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  USER_FEEDBACK_QUESTION_CANCEL_EVENT,
  getUserFeedbackAnswerEvent,
  type UserFeedbackCancelPayload,
} from '@sero/common';
import type { PendingQuestion, QuestionResponse } from '../../shared/types';
import { askQuestion, hasSeroIPCBridge } from '../ipc-bridge';
import { getUserFeedbackBus } from '../../shared/emitter';

function createPendingQuestion(id: string): PendingQuestion {
  return {
    id,
    type: 'questionnaire',
    toolCallId: `tool-${id}`,
    timestamp: new Date().toISOString(),
    questions: [
      {
        id: 'q0',
        label: 'Scope',
        prompt: 'What should we focus on?',
        options: [{ value: 'alpha', label: 'Alpha' }],
        allowOther: true,
      },
    ],
  };
}

describe('user-feedback ipc bridge', () => {
  let bus: EventEmitter;

  beforeEach(() => {
    bus = getUserFeedbackBus();
    bus.removeAllListeners();
  });

  afterEach(() => {
    bus.removeAllListeners();
  });

  it('reports whether the Sero renderer bridge is active', () => {
    expect(hasSeroIPCBridge()).toBe(false);

    bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, () => {
      // no-op bridge listener
    });

    expect(hasSeroIPCBridge()).toBe(true);
  });

  it('emits a question request and resolves with the renderer answer', async () => {
    const pending = createPendingQuestion('ufq-1');
    const captured: PendingQuestion[] = [];

    bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, (request: PendingQuestion) => {
      captured.push(request);
      const response: QuestionResponse = {
        id: request.id,
        cancelled: false,
        answers: [
          {
            questionId: 'q0',
            value: 'alpha',
            label: 'Alpha',
            wasCustom: false,
            index: 1,
          },
        ],
      };
      setImmediate(() => bus.emit(getUserFeedbackAnswerEvent(request.id), response));
    });

    const result = await askQuestion(pending);

    expect(captured).toEqual([pending]);
    expect(result).toEqual({
      id: 'ufq-1',
      cancelled: false,
      answers: [
        {
          questionId: 'q0',
          value: 'alpha',
          label: 'Alpha',
          wasCustom: false,
          index: 1,
        },
      ],
    });
  });

  it('emits a cancellation payload when the request is aborted', async () => {
    const pending = createPendingQuestion('ufq-2');
    const cancellations: UserFeedbackCancelPayload[] = [];

    bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, () => {
      // leave unanswered so the abort path owns completion
    });
    bus.on(USER_FEEDBACK_QUESTION_CANCEL_EVENT, (payload: UserFeedbackCancelPayload) => {
      cancellations.push(payload);
    });

    const controller = new AbortController();
    const promise = askQuestion(pending, controller.signal);

    await Promise.resolve();
    controller.abort();

    await expect(promise).resolves.toEqual({
      id: 'ufq-2',
      cancelled: true,
      answers: [],
    });
    expect(cancellations).toEqual([{ id: 'ufq-2' }]);
  });
});
