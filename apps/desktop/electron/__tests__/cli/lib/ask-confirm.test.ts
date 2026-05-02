import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

import { askConfirm } from '@electron/cli/lib/ask-confirm';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';
import type { UserFeedbackPendingQuestion, UserFeedbackResponse } from '@/types/ipc';

describe('askConfirm', () => {
  let bus: EventEmitter;

  beforeEach(() => {
    bus = getUserFeedbackBus();
    bus.removeAllListeners();
  });

  afterEach(() => {
    bus.removeAllListeners();
  });

  it('returns bridged: false when no question-request listener is registered', async () => {
    const result = await askConfirm({ prompt: 'Confirm?' });
    expect(result).toEqual({ bridged: false, confirmed: false, cancelled: false });
  });

  it('emits a question-request and resolves with confirmed: true on a "yes" answer', async () => {
    const captured: UserFeedbackPendingQuestion[] = [];
    bus.on('question-request', (q: UserFeedbackPendingQuestion) => {
      captured.push(q);
      // Simulate the renderer answering with the affirmative option.
      const response: UserFeedbackResponse = {
        id: q.id,
        cancelled: false,
        answers: [
          {
            questionId: 'q0',
            value: 'yes',
            label: 'Yes',
            wasCustom: false,
            index: 1,
          },
        ],
      };
      // Defer one tick so the helper has time to attach its answer
      // listener (the helper attaches AFTER it emits, so a sync emit
      // here would race in the wrong direction).
      setImmediate(() => bus.emit(`answer:${q.id}`, response));
    });

    const result = await askConfirm({ prompt: 'Mount this folder?' });

    expect(result).toEqual({ bridged: true, confirmed: true, cancelled: false });
    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe('question');
    expect(captured[0].questions[0].prompt).toBe('Mount this folder?');
    expect(captured[0].questions[0].options.map((o) => o.value)).toEqual(['yes', 'no']);
    expect(captured[0].questions[0].allowOther).toBe(false);
  });

  it('resolves with confirmed: false when the user picks the negative option', async () => {
    bus.on('question-request', (q: UserFeedbackPendingQuestion) => {
      setImmediate(() =>
        bus.emit(`answer:${q.id}`, {
          id: q.id,
          cancelled: false,
          answers: [
            { questionId: 'q0', value: 'no', label: 'Cancel', wasCustom: false, index: 2 },
          ],
        } satisfies UserFeedbackResponse),
      );
    });

    const result = await askConfirm({ prompt: 'Confirm?' });

    expect(result).toEqual({ bridged: true, confirmed: false, cancelled: false });
  });

  it('resolves with cancelled: true when the renderer reports a cancellation', async () => {
    bus.on('question-request', (q: UserFeedbackPendingQuestion) => {
      setImmediate(() =>
        bus.emit(`answer:${q.id}`, {
          id: q.id,
          cancelled: true,
          answers: [],
        } satisfies UserFeedbackResponse),
      );
    });

    const result = await askConfirm({ prompt: 'Confirm?' });

    expect(result).toEqual({ bridged: true, confirmed: false, cancelled: true });
  });

  it('honours custom yes/no labels and toolCallId', async () => {
    const captured: UserFeedbackPendingQuestion[] = [];
    bus.on('question-request', (q: UserFeedbackPendingQuestion) => {
      captured.push(q);
      setImmediate(() =>
        bus.emit(`answer:${q.id}`, {
          id: q.id,
          cancelled: false,
          answers: [
            { questionId: 'q0', value: 'yes', label: 'Mount it', wasCustom: false },
          ],
        } satisfies UserFeedbackResponse),
      );
    });

    await askConfirm({
      prompt: 'Confirm?',
      yesLabel: 'Mount it',
      noLabel: 'Skip',
      toolCallId: 'tool-42',
    });

    expect(captured[0].toolCallId).toBe('tool-42');
    expect(captured[0].questions[0].options.map((o) => o.label)).toEqual(['Mount it', 'Skip']);
  });

  it('cancels and emits question-cancel when the abort signal fires mid-flight', async () => {
    const cancellations: Array<{ id: string }> = [];
    bus.on('question-cancel', (data: { id: string }) => cancellations.push(data));
    // Listener that never answers — we want to test the abort path.
    bus.on('question-request', () => {
      /* swallow */
    });

    const controller = new AbortController();
    const promise = askConfirm({ prompt: 'Confirm?', signal: controller.signal });

    // Give the helper a microtask to attach its abort listener, then abort.
    await Promise.resolve();
    controller.abort();

    const result = await promise;

    expect(result).toEqual({ bridged: true, confirmed: false, cancelled: true });
    expect(cancellations).toHaveLength(1);
  });

  it('returns immediately as cancelled if the signal is already aborted', async () => {
    bus.on('question-request', () => {
      /* swallow */
    });
    const cancellations: Array<{ id: string }> = [];
    bus.on('question-cancel', (data: { id: string }) => cancellations.push(data));

    const controller = new AbortController();
    controller.abort();

    const result = await askConfirm({ prompt: 'Confirm?', signal: controller.signal });

    expect(result).toEqual({ bridged: true, confirmed: false, cancelled: true });
    expect(cancellations).toHaveLength(1);
  });
});
