// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuestionnaireForm } from './QuestionnaireForm';
import type { UserFeedbackPendingQuestion } from './types';

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return button;
}

function clickButton(container: HTMLElement, label: string): void {
  findButton(container, label).dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
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
      prompt: 'Which direction should we take?',
      allowOther: true,
      options: [
        { value: 'ship', label: 'Ship it' },
        { value: 'wait', label: 'Wait for more feedback' },
      ],
    },
    {
      id: 'q2',
      label: 'Q2',
      prompt: 'Anything else we should consider?',
      allowOther: true,
      options: [{ value: 'docs', label: 'Improve docs first' }],
    },
  ],
};

describe('QuestionnaireForm', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onSubmit = vi.fn<(id: string, answers: unknown[]) => void>();
  const onCancel = vi.fn<(id: string) => void>();

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onSubmit.mockReset();
    onCancel.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
  });

  it('submits partial answers and shows skipped questions in review', async () => {
    await act(async () => {
      root?.render(
        <QuestionnaireForm
          question={pendingQuestion}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Ship it');
    });

    expect(container.textContent).toContain('Anything else we should consider?');

    await act(async () => {
      clickButton(container, 'Skip');
    });

    expect(container.textContent).toContain('Review your answers');
    expect(container.textContent).toContain('1. Ship it');
    expect(container.textContent).toContain('Skipped');

    await act(async () => {
      clickButton(container, 'Submit All Answers');
    });

    expect(onSubmit).toHaveBeenCalledWith('pending-1', [
      {
        questionId: 'q1',
        value: 'ship',
        label: 'Ship it',
        wasCustom: false,
        index: 1,
      },
    ]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('reveals an option sub-question inline when that option is selected', async () => {
    const nestedQuestion: UserFeedbackPendingQuestion = {
      ...pendingQuestion,
      questions: [{
        id: 'delivery',
        label: 'Delivery',
        prompt: 'How should this be delivered?',
        allowOther: true,
        multiSelect: true,
        options: [
          { value: 'summary', label: 'Summary only' },
          {
            value: 'customized',
            label: 'Custom format',
            subQuestion: {
              id: 'format_depth',
              label: 'Depth',
              prompt: 'How much detail should the custom format include?',
              allowOther: false,
              options: [
                { value: 'light', label: 'Light' },
                { value: 'full', label: 'Full' },
              ],
            },
          },
        ],
      }],
    };

    await act(async () => {
      root?.render(
        <QuestionnaireForm
          question={nestedQuestion}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Custom format');
    });

    expect(container.textContent).toContain('How much detail should the custom format include?');

    await act(async () => {
      clickButton(container, 'Full');
    });

    await act(async () => {
      clickButton(container, 'Review');
    });

    await act(async () => {
      clickButton(container, 'Submit All Answers');
    });

    expect(onSubmit).toHaveBeenCalledWith('pending-1', [
      expect.objectContaining({ questionId: 'delivery', value: 'customized' }),
      expect.objectContaining({ questionId: 'format_depth', value: 'full' }),
    ]);
  });
});
