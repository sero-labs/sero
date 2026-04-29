// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const updateState = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => [{}, updateState],
}));

import { UserFeedbackApp } from './UserFeedbackApp';
import type { UserFeedbackPendingQuestion, UserFeedbackResponse } from './types';

type Unsubscribe = () => void;

interface UserFeedbackBridgeMock {
  getPending: () => Promise<UserFeedbackPendingQuestion[]>;
  onQuestion: (handler: (question: UserFeedbackPendingQuestion) => void) => Unsubscribe;
  onCancel: (handler: (payload: { id: string }) => void) => Unsubscribe;
  answer: (response: UserFeedbackResponse) => Promise<void>;
}

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

const pendingQuestion: UserFeedbackPendingQuestion = {
  id: 'pending-1',
  type: 'questionnaire',
  toolCallId: 'tool-1',
  timestamp: '2026-04-14T12:00:00.000Z',
  questions: [
    {
      id: 'q1',
      label: 'Q1',
      prompt: 'Pick a direction',
      allowOther: true,
      options: [{ value: 'ship', label: 'Ship it' }],
    },
  ],
};

describe('UserFeedbackApp', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let userFeedback: UserFeedbackBridgeMock;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    updateState.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    userFeedback = {
      getPending: vi.fn().mockResolvedValue([pendingQuestion]),
      onQuestion: vi.fn().mockReturnValue(() => undefined),
      onCancel: vi.fn().mockReturnValue(() => undefined),
      answer: vi.fn().mockResolvedValue(undefined),
    };

    window.sero = {
      userFeedback,
    };
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  it('hydrates pending questionnaires and clears them on the answered event', async () => {
    await act(async () => {
      root?.render(<UserFeedbackApp />);
      await flushPromises();
    });

    expect(userFeedback.getPending).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Questionnaire');
    expect(container.textContent).toContain('Pick a direction');

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('sero:user-feedback:answered', {
          detail: { id: 'pending-1' },
        }),
      );
      await flushPromises();
    });

    expect(container.textContent).toContain('When the agent needs your input, a form will appear here.');
  });
});
