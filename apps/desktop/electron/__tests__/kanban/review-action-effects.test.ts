import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Card } from '../../kanban/types';
import { applyReviewActionEffects } from '../../kanban/review-action-effects';

const { updateMock } = vi.hoisted(() => ({
  updateMock: vi.fn(),
}));

vi.mock('../../app-state', () => ({
  appStateManager: {
    update: updateMock,
  },
}));

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Review card',
    description: 'Test description',
    acceptance: ['It works'],
    priority: 'medium',
    column: 'review',
    status: 'waiting-input',
    prUrl: 'https://github.com/monobyte/sero/pull/87',
    prNumber: 87,
    worktreePath: '/tmp/workspace/.sero/worktrees/card-1',
    subtasks: [],
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('applyReviewActionEffects', () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  it('logs revision requests atomically without touching worktrees', async () => {
    let logState: unknown = null;
    updateMock.mockImplementation(async (_filePath, updater) => {
      logState = updater(logState);
    });
    const remove = vi.fn().mockResolvedValue(undefined);

    await applyReviewActionEffects(
      {
        stateFilePath: '/tmp/workspace/.sero/apps/kanban/state.json',
        workspacePath: '/tmp/workspace',
        worktreeManager: { remove } as never,
      },
      makeCard(),
      makeCard({
        column: 'in-progress',
        status: 'agent-working',
        prUrl: undefined,
        prNumber: undefined,
        error: '[REVISION REQUEST] Please fix the failing tests',
      }),
    );

    expect(remove).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith('/tmp/workspace/.sero/apps/kanban/errors.json', expect.any(Function));
    expect(logState).toMatchObject({
      errors: [
        expect.objectContaining({
          cardId: '1',
          phase: 'review',
          agentName: 'user',
          severity: 'warning',
          message: 'Revision requested: Please fix the failing tests',
        }),
      ],
    });
  });

  it('cleans up cancelled PR worktrees and logs the action once', async () => {
    let logState: unknown = null;
    updateMock.mockImplementation(async (_filePath, updater) => {
      logState = updater(logState);
    });
    const remove = vi.fn().mockResolvedValue(undefined);

    await applyReviewActionEffects(
      {
        stateFilePath: '/tmp/workspace/.sero/apps/kanban/state.json',
        workspacePath: '/tmp/workspace',
        worktreeManager: { remove } as never,
      },
      makeCard(),
      makeCard({
        column: 'backlog',
        status: 'idle',
        prUrl: undefined,
        prNumber: undefined,
        branch: undefined,
        worktreePath: undefined,
        error: '[PR CANCELLED] PR was cancelled by user and card returned to backlog.',
      }),
    );

    expect(remove).toHaveBeenCalledWith('/tmp/workspace', '1', {
      deleteBranch: true,
      force: true,
    });
    expect(logState).toMatchObject({
      errors: [
        expect.objectContaining({
          cardId: '1',
          message: 'PR cancelled by user — card returned to backlog',
        }),
      ],
    });
  });
});
