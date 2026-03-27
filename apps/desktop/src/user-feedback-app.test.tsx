// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type {
  UserFeedbackPendingQuestion,
  UserFeedbackResponse,
} from '../../../plugins/sero-user-feedback-plugin/ui/types';

const appRuntimeMocks = vi.hoisted(() => ({
  updateState: vi.fn(),
}));

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: () => [{}, appRuntimeMocks.updateState],
}));

import { UserFeedbackApp } from '../../../plugins/sero-user-feedback-plugin/ui/UserFeedbackApp';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createQuestion(
  id: string,
  prompt: string,
  optionLabel: string,
): UserFeedbackPendingQuestion {
  return {
    id,
    type: 'questionnaire',
    toolCallId: `tool-${id}`,
    timestamp: new Date().toISOString(),
    questions: [
      {
        id: 'q0',
        label: 'Scope',
        prompt,
        options: [{ value: `${id}-a`, label: optionLabel }],
        allowOther: true,
      },
    ],
  };
}

type TestSeroAPI = {
  userFeedback: Pick<
    Window['sero']['userFeedback'],
    'getPending' | 'answer' | 'onQuestion' | 'onCancel'
  >;
  profiles: Pick<
    Window['sero']['profiles'],
    'needsOnboarding' | 'markOnboardingDone'
  >;
};

function installSeroMock(sero: TestSeroAPI): void {
  Object.defineProperty(window, 'sero', {
    value: sero,
    configurable: true,
    writable: true,
  });
}

describe('UserFeedbackApp', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let pendingOnMount: UserFeedbackPendingQuestion[] = [];
  let questionListeners: Array<(data: UserFeedbackPendingQuestion) => void> = [];
  let cancelListeners: Array<(data: { id: string }) => void> = [];
  const answer = vi.fn<(response: UserFeedbackResponse) => Promise<void>>();
  const getPending = vi.fn<() => Promise<UserFeedbackPendingQuestion[]>>();
  const needsOnboarding = vi.fn<() => Promise<boolean>>();
  const markOnboardingDone = vi.fn<() => Promise<void>>();

  function getButtonByText(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes(text),
    );

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${text}`);
    }

    return button;
  }

  async function clickButton(text: string): Promise<void> {
    await act(async () => {
      getButtonByText(text).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  async function renderApp(initialPending: UserFeedbackPendingQuestion[] = []): Promise<void> {
    pendingOnMount = initialPending;

    await act(async () => {
      root?.render(<UserFeedbackApp />);
    });

    await act(async () => {
      await Promise.resolve();
    });
  }

  async function emitQuestion(question: UserFeedbackPendingQuestion): Promise<void> {
    await act(async () => {
      for (const listener of questionListeners) listener(question);
    });
  }

  beforeEach(() => {
    pendingOnMount = [];
    questionListeners = [];
    cancelListeners = [];
    appRuntimeMocks.updateState.mockReset();
    answer.mockReset();
    getPending.mockReset();
    needsOnboarding.mockReset();
    markOnboardingDone.mockReset();

    answer.mockImplementation(async (response) => {
      window.dispatchEvent(
        new CustomEvent('sero:user-feedback:answered', { detail: { id: response.id } }),
      );
    });
    getPending.mockImplementation(async () => pendingOnMount);
    needsOnboarding.mockResolvedValue(false);
    markOnboardingDone.mockResolvedValue(undefined);

    installSeroMock({
      userFeedback: {
        getPending,
        answer,
        onQuestion: (callback: (data: UserFeedbackPendingQuestion) => void) => {
          questionListeners.push(callback);
          return () => {
            questionListeners = questionListeners.filter((listener) => listener !== callback);
          };
        },
        onCancel: (callback: (data: { id: string }) => void) => {
          cancelListeners.push(callback);
          return () => {
            cancelListeners = cancelListeners.filter((listener) => listener !== callback);
          };
        },
      },
      profiles: {
        needsOnboarding,
        markOnboardingDone,
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container.remove();
  });

  it('keeps showing the current prompt when a later questionnaire arrives', async () => {
    const first = createQuestion('questionnaire-1', 'First prompt', 'First option');
    const second = createQuestion('questionnaire-2', 'Second prompt', 'Second option');

    await renderApp([first]);

    expect(container.textContent).toContain('First prompt');
    expect(container.textContent).not.toContain('Second prompt');

    await emitQuestion(second);

    expect(container.textContent).toContain('First prompt');
    expect(container.textContent).not.toContain('Second prompt');
  });

  it('shows the next pending questionnaire after the current one is submitted', async () => {
    const first = createQuestion('questionnaire-1', 'First prompt', 'First option');
    const second = createQuestion('questionnaire-2', 'Second prompt', 'Second option');

    await renderApp([first, second]);

    expect(container.textContent).toContain('First prompt');

    await clickButton('First option');
    await clickButton('Submit All Answers');

    expect(answer).toHaveBeenCalledWith({
      id: 'questionnaire-1',
      answers: [
        {
          questionId: 'q0',
          value: 'questionnaire-1-a',
          label: 'First option',
          wasCustom: false,
          index: 1,
        },
      ],
      cancelled: false,
    });
    expect(container.textContent).toContain('Second prompt');
    expect(container.textContent).not.toContain('First prompt');
  });
});
