// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const mocks = {
    restoreCheckpoint: vi.fn(),
    fetchDiff: vi.fn(),
    loadWorkspace: vi.fn(),
  };
  const useVcsStore = Object.assign(
    <T,>(selector: (state: typeof mocks) => T) => selector(mocks),
    { getState: () => mocks },
  );
  return { mocks, useVcsStore };
});

vi.mock('@/stores/vcs', () => ({
  useVcsStore: store.useVcsStore,
}));

import { useCheckpointRestore } from './useCheckpointRestore';
import type { ChatTurnUndoRef } from '@/types/ipc';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('useCheckpointRestore', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const turnUndo: ChatTurnUndoRef = {
    kind: 'turn-undo',
    workspaceId: 'ws-1',
    snapshotId: 'snap-1',
    targetUserEntryId: 'user-entry-1',
    label: 'Update joke.txt',
    createdAt: '2026-04-17T11:10:00.000Z',
  };

  function Harness() {
    const restore = useCheckpointRestore('ws-1', 'session-1');
    return (
      <div data-open={String(restore.dialogOpen)}>
        <button type="button" onClick={() => restore.requestRestore(turnUndo)}>
          request
        </button>
        <button type="button" onClick={() => restore.confirmRestore()}>
          confirm
        </button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    store.mocks.fetchDiff.mockResolvedValue('diff --git a/joke.txt b/joke.txt\n--- a/joke.txt\n+++ /dev/null');
    store.mocks.restoreCheckpoint.mockResolvedValue(undefined);
    store.mocks.loadWorkspace.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    window.sero = {
      agent: {
        undoToTurn: vi.fn().mockResolvedValue([]),
      },
    } as never;
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

  it('loads a preview for the target snapshot and routes confirmation through undoToTurn', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    const [requestButton, confirmButton] = Array.from(container.querySelectorAll('button'));

    await act(async () => {
      requestButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(store.mocks.fetchDiff).toHaveBeenCalledWith('ws-1', 'snap-1');
    expect(container.firstElementChild?.getAttribute('data-open')).toBe('true');

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(window.sero.agent.undoToTurn).toHaveBeenCalledWith('session-1', turnUndo);
    expect(store.mocks.loadWorkspace).toHaveBeenCalledWith('ws-1');
  });
});
