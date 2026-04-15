// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroSlashCommandInfo } from '@/types/ipc';

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
  const sendCollaborationPrompt = vi.fn();
  const steerAgent = vi.fn();
  const enqueue = vi.fn();
  const onLoginRequest = vi.fn();

  function Harness() {
    const {
      input,
      setInput,
      handleSlashSelect,
      handleSubmit,
    } = useChatPromptInput({
      sessionId: 'session-1',
      isStreaming: false,
      focusedWorkspaceId: null,
      sendPrompt,
      sendCollaborationPrompt,
      collaborationMode: false,
      steerAgent,
      messageQueue: { enqueue },
      onLoginRequest,
    });

    return (
      <div data-input={input}>
        <button onClick={() => handleSlashSelect(BUILTIN_LOGIN_COMMAND)}>Slash login</button>
        <button onClick={() => setInput('/logout ')}>Set logout input</button>
        <button onClick={() => handleSubmit({ text: input, files: [] })}>Submit</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(sendCollaborationPrompt).not.toHaveBeenCalled();
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
    expect(sendCollaborationPrompt).not.toHaveBeenCalled();
    expect(steerAgent).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
