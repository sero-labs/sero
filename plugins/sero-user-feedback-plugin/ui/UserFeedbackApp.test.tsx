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

  it('starts a newly queued questionnaire at its first question', async () => {
    const firstQuestionnaire: UserFeedbackPendingQuestion = {
      ...pendingQuestion,
      questions: [
        ...pendingQuestion.questions,
        { id: 'q2', label: 'Q2', prompt: 'Second question', options: [], allowOther: true },
        { id: 'q3', label: 'Q3', prompt: 'Third question', options: [], allowOther: true },
        { id: 'q4', label: 'Q4', prompt: 'Fourth question', options: [], allowOther: true },
      ],
    };
    const nextQuestionnaire: UserFeedbackPendingQuestion = {
      ...pendingQuestion,
      id: 'pending-2',
      questions: [{ id: 'name', label: 'Name', prompt: 'What is your name?', options: [], allowOther: true }],
    };
    let receiveQuestion: ((question: UserFeedbackPendingQuestion) => void) | undefined;
    userFeedback.getPending = vi.fn().mockResolvedValue([firstQuestionnaire]);
    userFeedback.onQuestion = vi.fn((handler) => {
      receiveQuestion = handler;
      return () => undefined;
    });

    await act(async () => {
      root?.render(<UserFeedbackApp />);
      await flushPromises();
    });

    const fourthStep = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Q4'),
    );
    expect(fourthStep).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      fourthStep?.click();
    });
    expect(container.textContent).toContain('Fourth question');

    await act(async () => {
      receiveQuestion?.(nextQuestionnaire);
      window.dispatchEvent(new CustomEvent('sero:user-feedback:answered', {
        detail: { id: firstQuestionnaire.id },
      }));
    });

    expect(container.textContent).toContain('What is your name?');
    expect(container.textContent).not.toContain('Fourth question');
  });
});
