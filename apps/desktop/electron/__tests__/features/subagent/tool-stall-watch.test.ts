import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { USER_FEEDBACK_QUESTION_REQUEST_EVENT, getUserFeedbackAnswerEvent } from '@sero-ai/common';

import { createToolStallWatch } from '@electron/features/subagent/runtime/abort-grace';
import { holdWhileAsking } from '@electron/features/subagent/runtime/hold-while-asking';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';

describe('the stall watch and a tool that makes calls of its own', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not stall a script that runs longer than the period while its calls make progress', () => {
    const onStall = vi.fn();
    const watch = createToolStallWatch(100, onStall);

    watch.start('script', 'codemode');
    for (const id of ['script/1', 'script/2', 'script/3']) {
      watch.start(id, 'bash', 'script');
      vi.advanceTimersByTime(60);
      watch.end(id);
    }

    expect(onStall).not.toHaveBeenCalled();
  });

  it('stalls the call that stopped making progress', () => {
    const onStall = vi.fn();
    const watch = createToolStallWatch(100, onStall);

    watch.start('script', 'codemode');
    watch.start('script/1', 'bash', 'script');
    vi.advanceTimersByTime(100);

    expect(onStall).toHaveBeenCalledWith('bash');
  });
});

describe('a tool call waiting on the user', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('is not stalled while its permission question is open, and is timed again once answered', () => {
    const onStall = vi.fn();
    const watch = createToolStallWatch(100, onStall);
    const stop = holdWhileAsking(watch);
    const bus = getUserFeedbackBus();

    watch.start('call-1', 'bash');
    bus.emit(USER_FEEDBACK_QUESTION_REQUEST_EVENT, { id: 'q1', type: 'permission', toolCallId: 'call-1' });
    vi.advanceTimersByTime(10_000);
    expect(onStall).not.toHaveBeenCalled();

    bus.emit(getUserFeedbackAnswerEvent('q1'), { id: 'q1', answers: [{ value: 'allow' }] });
    vi.advanceTimersByTime(100);
    expect(onStall).toHaveBeenCalledWith('bash');
    stop();
  });
});
