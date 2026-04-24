// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

vi.mock('lucide-react', () => ({
  Bot: () => <svg data-icon="bot" />,
  Check: () => <svg data-icon="check" />,
  Copy: () => <svg data-icon="copy" />,
  Loader2: () => <svg data-icon="loader" />,
  RotateCcw: () => <svg data-icon="undo" />,
  User: () => <svg data-icon="user" />,
  Settings2: () => <svg data-icon="settings" />,
  Brain: () => <svg data-icon="brain" />,
  Database: () => <svg data-icon="database" />,
  MessageSquare: () => <svg data-icon="message-square" />,
  Users: () => <svg data-icon="users" />,
  Swords: () => <svg data-icon="swords" />,
  ChevronDown: () => <svg data-icon="chevron-down" />,
}));

vi.mock('@sero-ai/ui/components/ai-elements/message', () => ({
  Message: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageAction: ({ children, label, onClick }: ComponentPropsWithoutRef<'button'> & { label?: string }) => (
    <button type="button" aria-label={label} onClick={onClick}>
      {label}
      {children}
    </button>
  ),
  MessageContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MessageResponse: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@sero-ai/ui/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('./ChatAttachments', () => ({
  MessageAttachments: () => null,
}));
vi.mock('./ThinkingBlock', () => ({ ThinkingBlock: () => null }));
vi.mock('./MemoryContextBlock', () => ({ MemoryContextBlock: () => null }));
vi.mock('./ResponseFeedback', () => ({ ResponseFeedback: () => null }));

import { ChatMessageItem } from './ChatMessageItem';
import type { ChatTurnUndoRef } from '@/types/ipc';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatMessageItem turn-undo affordance', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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

  it('shows an Undo this turn action for user messages with a turn-undo ref', async () => {
    const turnUndo: ChatTurnUndoRef = {
      kind: 'turn-undo',
      workspaceId: 'ws-1',
      snapshotId: 'snap-1',
      targetUserEntryId: 'user-entry-1',
      label: 'Update joke.txt',
      createdAt: '2026-04-17T11:00:00.000Z',
    };
    const onRestoreTurnUndo = vi.fn();

    await act(async () => {
      root?.render(
        <ChatMessageItem
          message={{ type: 'user', id: 'user-1', text: 'save that to file joke.txt', turnUndo }}
          onRestoreTurnUndo={onRestoreTurnUndo}
        />,
      );
    });

    const button = container.querySelector('button[aria-label="Undo this turn"]');
    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onRestoreTurnUndo).toHaveBeenCalledWith(turnUndo);
  });

  it('hides the undo action when no turn-undo ref is present', async () => {
    await act(async () => {
      root?.render(
        <ChatMessageItem
          message={{ type: 'user', id: 'user-1', text: 'tell me a joke' }}
          onRestoreTurnUndo={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('button[aria-label="Undo this turn"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Copy message to clipboard"]')).not.toBeNull();
  });
});

describe('ChatMessageItem assistant chrome', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
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

  it('hides the bot avatar for thinking-only assistant messages', async () => {
    await act(async () => {
      root?.render(
        <ChatMessageItem
          message={{
            type: 'assistant',
            id: 'assistant-1',
            text: '',
            thinking: 'Working through the next step',
            isStreaming: true,
          }}
          showThinking
        />,
      );
    });

    expect(container.querySelector('[data-icon="bot"]')).toBeNull();
  });

  it('shows a spinner when thinking is hidden for a streaming assistant message', async () => {
    await act(async () => {
      root?.render(
        <ChatMessageItem
          message={{
            type: 'assistant',
            id: 'assistant-1',
            text: '',
            thinking: 'Working through the next step',
            isStreaming: true,
          }}
          showThinking={false}
        />,
      );
    });

    expect(container.querySelector('[data-icon="loader"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="bot"]')).toBeNull();
    expect(container.textContent).toContain('Thinking...');
  });
});
