// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

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
      label: 'checkpoint: save that to file joke.txt',
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

    expect(container.querySelector('button')).toBeNull();
  });
});
