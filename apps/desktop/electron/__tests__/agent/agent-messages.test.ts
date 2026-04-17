import { describe, expect, it } from 'vitest';

import {
  buildTurnUndoMapByTurn,
  convertSessionMessages,
} from '@electron/ipc/agent/core/agent-messages';

describe('agent turn-undo message mapping', () => {
  it('attaches turn-undo refs to the same user turn they undo', () => {
    const session = {
      sessionManager: {
        getBranch: () => [
          {
            id: 'user-entry-1',
            type: 'message',
            message: { role: 'user', content: 'tell me a joke' },
          },
          {
            id: 'undo-entry-1',
            type: 'custom',
            customType: 'turn-undo',
            data: {
              workspaceId: 'ws-1',
              snapshotId: 'snap-1',
              targetUserEntryId: 'user-entry-1',
              label: 'checkpoint: tell me a joke',
              recordedAt: '2026-04-17T09:00:00.000Z',
            },
          },
          {
            id: 'user-entry-2',
            type: 'message',
            message: { role: 'user', content: 'save that to file joke.txt' },
          },
          {
            id: 'undo-entry-2',
            type: 'custom',
            customType: 'turn-undo',
            data: {
              workspaceId: 'ws-1',
              snapshotId: 'snap-2',
              targetUserEntryId: 'user-entry-2',
              label: 'checkpoint: save that to file joke.txt',
              recordedAt: '2026-04-17T09:01:00.000Z',
            },
          },
        ],
      },
    } as never;

    const turnUndoByTurn = buildTurnUndoMapByTurn(session, 'ws-1');
    const messages = convertSessionMessages([
      { role: 'user', content: 'tell me a joke' },
      { role: 'assistant', content: [{ type: 'text', text: 'Why did the...' }] },
      { role: 'user', content: 'save that to file joke.txt' },
      { role: 'assistant', content: [{ type: 'text', text: 'Saved it.' }] },
    ] as never, turnUndoByTurn);

    const userMessages = messages.filter((message) => message.type === 'user');
    expect(userMessages).toHaveLength(2);
    expect(userMessages[0]).toMatchObject({
      text: 'tell me a joke',
      turnUndo: expect.objectContaining({
        kind: 'turn-undo',
        snapshotId: 'snap-1',
        targetUserEntryId: 'user-entry-1',
      }),
    });
    expect(userMessages[1]).toMatchObject({
      text: 'save that to file joke.txt',
      turnUndo: expect.objectContaining({
        kind: 'turn-undo',
        snapshotId: 'snap-2',
        targetUserEntryId: 'user-entry-2',
      }),
    });
  });

  it('ignores legacy git-checkpoint turn entries for inline chat undo UI', () => {
    const session = {
      sessionManager: {
        getBranch: () => [
          {
            id: 'user-entry-1',
            type: 'message',
            message: { role: 'user', content: 'save that to file joke.txt' },
          },
          {
            id: 'legacy-checkpoint-entry',
            type: 'custom',
            customType: 'git-checkpoint',
            data: {
              workspaceId: 'ws-1',
              changeId: 'legacy-cp-1',
              description: 'checkpoint: turn',
              source: 'turn',
              recordedAt: '2026-04-17T09:02:00.000Z',
            },
          },
        ],
      },
    } as never;

    const turnUndoByTurn = buildTurnUndoMapByTurn(session, 'ws-1');
    const messages = convertSessionMessages([
      { role: 'user', content: 'save that to file joke.txt' },
    ] as never, turnUndoByTurn);

    expect(turnUndoByTurn.size).toBe(0);
    expect(messages[0]).toMatchObject({ type: 'user', text: 'save that to file joke.txt' });
    expect((messages[0] as { turnUndo?: unknown }).turnUndo).toBeUndefined();
  });
});
