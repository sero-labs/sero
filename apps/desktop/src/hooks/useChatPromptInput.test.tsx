// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { ChatComposerPrefill, SeroSlashCommandInfo } from '@/types/ipc';

vi.mock('@/stores/agent-selectors', () => ({
  useFocusedCommands: () => [],
}));

vi.mock('./useWorkspaceFiles', async () => {
  const actual = await vi.importActual<typeof import('./useWorkspaceFiles')>('./useWorkspaceFiles');
  return {
    ...actual,
    useWorkspaceFiles: () => ({ files: [], isLoading: false, refresh: async () => {} }),
  };
});

import { useChatPromptInput } from './useChatPromptInput';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BUILTIN_LOGIN_COMMAND: SeroSlashCommandInfo = {
  name: 'login',
  description: 'Login with OAuth provider',
  source: 'extension',
};

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button with label containing "${label}"`);
  }
  return button;
}

function readInput(container: HTMLDivElement): string | null {
  return container.firstElementChild?.getAttribute('data-input') ?? null;
}

describe('useChatPromptInput', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  const sendPrompt = vi.fn();
  const steerAgent = vi.fn();
  const enqueue = vi.fn();
  const onLoginRequest = vi.fn();
  const onExternalDraftApplied = vi.fn();

  function Harness() {
    const [externalDraft, setExternalDraft] = useState<ChatComposerPrefill | null>(null);
    const {
      input,
      setInput,
      textareaRef,
      handleSlashSelect,
      handleSubmit,
    } = useChatPromptInput({
      sessionId: 'session-1',
      isStreaming: false,
      focusedWorkspaceId: null,
      sendPrompt,
      steerAgent,
      messageQueue: { enqueue },
      onLoginRequest,
      externalDraft,
      onExternalDraftApplied,
    });

    return (
      <div data-input={input}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="button" onClick={() => handleSlashSelect(BUILTIN_LOGIN_COMMAND)}>Slash login</button>
        <button type="button" onClick={() => setInput('/logout ')}>Set logout input</button>
        <button type="button" onClick={() => handleSubmit({ text: input, files: [] })}>Submit</button>
        <button type="button"
          onClick={() => setExternalDraft({
            requestId: 'prefill-1',
            text: 'Retry this request',
            source: 'turn-undo',
          })}
        >
          Apply draft
        </button>
        <button type="button"
          onClick={() => setExternalDraft({
            requestId: 'prefill-1',
            text: 'Retry this request',
            source: 'turn-undo',
          })}
        >
          Reapply same request
        </button>
        <button type="button"
          onClick={() => setExternalDraft({
            requestId: 'prefill-2',
            text: 'Retry this request',
            source: 'turn-undo',
          })}
        >
          Apply same text new request
        </button>
        <button type="button" onClick={() => setInput('edited locally')}>Manual edit</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
  });

  it('routes slash-selected built-in commands through one shared login handler', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      findButton('Slash login').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLoginRequest).toHaveBeenCalledWith('login');
    expect(readInput(container)).toBe('');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(steerAgent).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('routes raw built-in command submits through the same handler', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    await act(async () => {
      findButton('Set logout input').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(readInput(container)).toBe('/logout ');

    await act(async () => {
      findButton('Submit').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLoginRequest).toHaveBeenCalledWith('logout');
    expect(readInput(container)).toBe('');
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(steerAgent).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('applies external drafts once per request id and focuses the textarea', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    const textarea = container.querySelector('textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Expected textarea');
    }

    await act(async () => {
      findButton('Apply draft').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(readInput(container)).toBe('Retry this request');
    expect(document.activeElement).toBe(textarea);
    expect(onExternalDraftApplied).toHaveBeenCalledTimes(1);
    expect(onExternalDraftApplied).toHaveBeenLastCalledWith({
      requestId: 'prefill-1',
      text: 'Retry this request',
      source: 'turn-undo',
    });

    await act(async () => {
      findButton('Manual edit').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(readInput(container)).toBe('edited locally');

    await act(async () => {
      findButton('Reapply same request').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(readInput(container)).toBe('edited locally');
    expect(onExternalDraftApplied).toHaveBeenCalledTimes(1);

    await act(async () => {
      findButton('Apply same text new request').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(readInput(container)).toBe('Retry this request');
    expect(onExternalDraftApplied).toHaveBeenCalledTimes(2);
    expect(onExternalDraftApplied).toHaveBeenLastCalledWith({
      requestId: 'prefill-2',
      text: 'Retry this request',
      source: 'turn-undo',
    });
  });
});
