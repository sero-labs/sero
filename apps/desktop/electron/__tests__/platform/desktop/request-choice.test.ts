import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requestChoice } from '@electron/platform/desktop/request-choice';
import { getUserFeedbackBus } from '@electron/shared/lib/user-feedback-bus';
import type { UserFeedbackPendingQuestion, UserFeedbackResponse } from '@/types/ipc';

describe('requestChoice', () => {
  let bus: EventEmitter;

  beforeEach(() => {
    bus = getUserFeedbackBus();
    bus.removeAllListeners();
  });

  afterEach(() => bus.removeAllListeners());

  it('times out immediately when no renderer is listening', async () => {
    await expect(requestChoice({ title: 'Run?', body: 'Choose', choices: [], timeoutMs: 1_000 }))
      .resolves.toEqual({ choiceId: null, timedOut: true });
  });

  it('passes contextual presentation and open-target metadata to the renderer', async () => {
    let pending: UserFeedbackPendingQuestion | undefined;
    bus.on('question-request', (question: UserFeedbackPendingQuestion) => {
      pending = question;
      setImmediate(() => bus.emit(`answer:${question.id}`, {
        id: question.id,
        cancelled: false,
        answers: [{ questionId: 'q0', value: 'isolated', label: 'Run isolated', wasCustom: false }],
      } satisfies UserFeedbackResponse));
    });

    const result = await requestChoice({
      title: 'Weekly digest wants to run',
      body: 'This workspace has 2 changes.',
      timeoutMs: 30_000,
      fallbackLabel: 'run isolated',
      context: { source: 'Sero Orchestrator', workspaceId: 'ws-1', trigger: 'Scheduled loop' },
      openTarget: { appId: 'orchestrator', workspaceId: 'ws-1', params: { loopId: 'loop-1' }, label: 'Open workflow' },
      choices: [
        { id: 'isolated', label: 'Run isolated', emphasis: 'primary' },
        { id: 'one-hour', label: '1 hour', menu: 'Snooze' },
      ],
    });

    expect(result).toEqual({ choiceId: 'isolated', timedOut: false });
    expect(pending?.context).toEqual({ source: 'Sero Orchestrator', workspaceId: 'ws-1', trigger: 'Scheduled loop' });
    expect(pending?.openTarget?.params).toEqual({ loopId: 'loop-1' });
    expect(pending?.fallbackLabel).toBe('run isolated');
    expect(pending?.questions[0].options).toMatchObject([
      { value: 'isolated', emphasis: 'primary' },
      { value: 'one-hour', menu: 'Snooze' },
    ]);
    expect(Date.parse(pending?.expiresAt ?? '')).toBeGreaterThan(Date.now());
  });
});
