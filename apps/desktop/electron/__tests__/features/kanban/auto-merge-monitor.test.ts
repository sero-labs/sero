import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Card, KanbanState } from '@electron/features/kanban/core/types';

const { readMock, updateCardMock, getPullRequestMergeStateMock, getPullRequestMergeErrorMock } = vi.hoisted(() => ({
  readMock: vi.fn(),
  updateCardMock: vi.fn(),
  getPullRequestMergeStateMock: vi.fn(),
  getPullRequestMergeErrorMock: vi.fn(),
}));

vi.mock('@electron/features/apps/state/manager', () => ({
  appStateManager: {
    read: readMock,
  },
}));

vi.mock('@electron/features/kanban/core/state-helpers', () => ({
  updateCard: updateCardMock,
}));

vi.mock('@electron/features/vcs/worktree/merge-status', () => ({
  getPullRequestMergeState: getPullRequestMergeStateMock,
  getPullRequestMergeError: getPullRequestMergeErrorMock,
}));

import { AutoMergeMonitor, buildAutoMergePendingMessage } from '@electron/features/kanban/quality/auto-merge-monitor';

function makeState(card: Card): KanbanState {
  return {
    cards: [card],
    nextId: 2,
    settings: {
      autoAdvance: true,
      reviewMode: 'full',
      testingEnabled: true,
      yoloMode: true,
      yoloAutoMergePrs: true,
    },
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Auto-merge review card',
    description: 'Wait for GitHub auto-merge',
    acceptance: ['PR lands automatically'],
    priority: 'medium',
    column: 'review',
    status: 'waiting-input',
    subtasks: [],
    prUrl: 'https://github.com/monobyte/sero/pull/1',
    prNumber: 1,
    worktreePath: '/tmp/worktree',
    error: buildAutoMergePendingMessage(1),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AutoMergeMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readMock.mockReset();
    updateCardMock.mockReset();
    getPullRequestMergeStateMock.mockReset();
    getPullRequestMergeErrorMock.mockReset();
    updateCardMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('promotes pending review cards to done once GitHub reports them as merged', async () => {
    const state = makeState(makeCard());
    readMock.mockResolvedValue(state);
    getPullRequestMergeStateMock.mockResolvedValue('merged');

    const monitor = new AutoMergeMonitor();
    monitor.syncWorkspace({ workspaceId: 'workspace-1', stateFilePath: '/tmp/state.json' }, state);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(updateCardMock).toHaveBeenCalledWith('/tmp/state.json', '1', expect.objectContaining({
      column: 'done',
      status: 'idle',
      error: undefined,
    }));
  });
});
