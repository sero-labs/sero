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
              label: 'tell me a joke',
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
              label: 'Update joke.txt',
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

describe('incomplete tool history', () => {
  it('reopens a tool call without a result as running', () => {
    const messages = convertSessionMessages([{
      role: 'assistant',
      content: [{
        type: 'toolCall',
        id: 'call-incomplete',
        name: 'write',
        arguments: { path: 'unfinished.txt' },
      }],
    }] as never);

    expect(messages).toEqual([
      expect.objectContaining({
        type: 'tool',
        toolCallId: 'call-incomplete',
        state: 'running',
        isError: false,
      }),
    ]);
  });

  it('keeps a successful empty tool result completed', () => {
    const messages = convertSessionMessages([
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'call-empty', name: 'write', arguments: {} }],
      },
      {
        role: 'toolResult',
        toolCallId: 'call-empty',
        toolName: 'write',
        content: [],
        isError: false,
      },
    ] as never);

    expect(messages).toEqual([
      expect.objectContaining({
        type: 'tool',
        toolCallId: 'call-empty',
        state: 'completed',
        isError: false,
      }),
    ]);
  });
});

describe('Goal custom-message projection', () => {
  const goal = {
    id: 'goal-1',
    objective: 'Make the build green',
    criteria: ['pnpm build exits zero'],
    status: 'active',
    limits: { maxAttemptsTotal: 25 },
    usage: { automaticTurns: 4, totalTokens: 1200, costUsd: 0.12, activeMs: 5000 },
    progress: { repeats: 0 },
  };

  it('turns hidden Goal contracts into banner state without exposing contract text', () => {
    const messages = convertSessionMessages([{
      role: 'custom',
      customType: 'goal-contract',
      content: 'private goal contract',
      display: false,
      details: { goal },
    }] as never);

    expect(messages).toEqual([expect.objectContaining({ type: 'goal-state', goal })]);
    expect(JSON.stringify(messages)).not.toContain('private goal contract');
  });

  it('projects continuations and status updates without raw custom-type prefixes', () => {
    const messages = convertSessionMessages([
      {
        role: 'custom',
        customType: 'goal-continuation',
        content: 'raw continuation instructions',
        display: true,
        details: { goalId: 'goal-1', automaticTurns: 4, maxAutomaticTurns: 25 },
      },
      {
        role: 'custom',
        customType: 'goal-status',
        content: 'Goal paused because the turn was cancelled.',
        display: true,
        details: { goal: { ...goal, status: 'paused', pauseReason: 'abort' } },
      },
    ] as never);

    expect(messages).toMatchObject([
      { type: 'goal-continuation', goalId: 'goal-1', automaticTurns: 4, maxAutomaticTurns: 25 },
      { type: 'goal-status', text: 'Goal paused because the turn was cancelled.' },
    ]);
    expect(JSON.stringify(messages)).not.toContain('[goal-continuation]');
    expect(JSON.stringify(messages)).not.toContain('raw continuation instructions');
  });
});
