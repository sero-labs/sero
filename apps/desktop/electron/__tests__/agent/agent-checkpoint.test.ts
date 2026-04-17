import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatTurnUndoRef } from '@/types/ipc';
import {
  undoToTurn,
  type AgentPoolCheckpointEntry,
} from '@electron/ipc/agent/core/agent-checkpoint';

const mocks = vi.hoisted(() => ({
  restoreCheckpoint: vi.fn(),
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  vcsManager: {
    restoreCheckpoint: mocks.restoreCheckpoint,
  },
}));

describe('undoToTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.restoreCheckpoint.mockResolvedValue(undefined);
  });

  it('restores the snapshot, navigates to the target user entry, and prefills the composer', async () => {
    const navigateTree = vi.fn().mockResolvedValue({
      cancelled: false,
      editorText: 'save that to file joke.txt',
    });
    const sendEvent = vi.fn();
    const entry: AgentPoolCheckpointEntry = {
      workspaceId: 'ws-1',
      pendingTurnUndoUserMessageId: 'msg-user-1',
      session: {
        agent: { state: { isStreaming: false } },
        navigateTree,
        sessionManager: {
          getBranch: () => [],
        },
        messages: [],
      } as never,
    };
    const turnUndo: ChatTurnUndoRef = {
      kind: 'turn-undo',
      workspaceId: 'ws-1',
      snapshotId: 'snap-1',
      targetUserEntryId: 'user-entry-1',
      label: 'checkpoint: save that to file joke.txt',
      createdAt: '2026-04-17T10:00:00.000Z',
    };

    const messages = await undoToTurn({
      entry,
      sessionId: 'session-1',
      turnUndo,
      sendEvent,
    });

    expect(mocks.restoreCheckpoint).toHaveBeenCalledWith('ws-1', 'snap-1');
    expect(navigateTree).toHaveBeenCalledWith('user-entry-1', { summarize: false });
    expect(messages).toEqual([]);
    expect(sendEvent).toHaveBeenNthCalledWith(1, {
      type: 'messages_loaded',
      sessionId: 'session-1',
      messages: [],
    });
    expect(sendEvent).toHaveBeenNthCalledWith(2, {
      type: 'composer_prefill',
      sessionId: 'session-1',
      prefill: expect.objectContaining({
        text: 'save that to file joke.txt',
        source: 'turn-undo',
      }),
    });
    expect(entry.pendingTurnUndoUserMessageId).toBeNull();
  });
});
