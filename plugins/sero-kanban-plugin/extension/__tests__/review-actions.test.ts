import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Card, KanbanState } from '../../shared/types';

const writeState = vi.fn();
const appendError = vi.fn();
const removeWorktree = vi.fn();
const closePullRequest = vi.fn();
const deleteReviewCache = vi.fn();

vi.mock('../state-io', () => ({
  writeState,
}));

vi.mock('../error-log', () => ({
  appendError,
}));

vi.mock('../worktree-cleanup', () => ({
  removeWorktree,
}));

vi.mock('../review-artifacts', () => ({
  closePullRequest,
  deleteReviewCache,
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
    worktreePath: '/tmp/card-1',
    subtasks: [{ id: 'sub-1', title: 'Ship', description: '', status: 'completed', dependsOn: [] }],
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

function makeState(card: Card): KanbanState {
  return {
    cards: [card],
    nextId: 2,
    settings: {
      autoAdvance: true,
      reviewMode: 'full',
      testingEnabled: true,
      yoloMode: false,
      yoloAutoMergePrs: false,
    },
  };
}

describe('review actions', () => {
  beforeEach(() => {
    writeState.mockReset();
    appendError.mockReset();
    removeWorktree.mockReset();
    closePullRequest.mockReset();
    deleteReviewCache.mockReset();
  });

  it('blocks request-revisions until the card is awaiting input with a PR', async () => {
    const { handleRequestRevisions } = await import('../review-actions');
    const state = makeState(makeCard({ status: 'agent-working' }));

    const result = await handleRequestRevisions('/tmp/state.json', state, '1', 'Please fix the regression');

    expect(result.content[0]?.text).toContain('Card must be awaiting human input');
    expect(writeState).not.toHaveBeenCalled();
    expect(appendError).not.toHaveBeenCalled();
  });

  it('blocks cancel-pr when the review card has no PR URL', async () => {
    const { handleCancelPR } = await import('../review-actions');
    const state = makeState(makeCard({ prUrl: undefined }));

    const result = await handleCancelPR('/tmp/state.json', state, '/workspace', '1');

    expect(result.content[0]?.text).toContain('Card must have a pull request URL');
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(writeState).not.toHaveBeenCalled();
    expect(appendError).not.toHaveBeenCalled();
  });

  it('cancels a review PR, removes the worktree, and logs the action', async () => {
    const { handleCancelPR } = await import('../review-actions');
    const state = makeState(makeCard());

    const result = await handleCancelPR('/tmp/state.json', state, '/workspace', '1');

    expect(result.content[0]?.text).toContain('closed on GitHub');
    expect(closePullRequest).toHaveBeenCalledWith('/workspace', 87);
    expect(removeWorktree).toHaveBeenCalledWith('/workspace', '/tmp/card-1');
    expect(deleteReviewCache).toHaveBeenCalledWith('/workspace', '1', undefined);
    expect(writeState).toHaveBeenCalledWith('/tmp/state.json', state);
    expect(appendError).toHaveBeenCalledWith('/tmp/state.json', expect.objectContaining({
      cardId: '1',
      phase: 'review',
      message: 'PR cancelled by user — card returned to backlog',
    }));
    expect(state.cards[0]).toMatchObject({
      column: 'backlog',
      status: 'idle',
      prUrl: undefined,
      prNumber: undefined,
      branch: undefined,
      worktreePath: undefined,
      plan: undefined,
    });
    expect(state.cards[0]?.subtasks).toEqual([]);
  });

  it('keeps the card in review when GitHub PR close fails', async () => {
    const { handleCancelPR } = await import('../review-actions');
    const state = makeState(makeCard());
    closePullRequest.mockRejectedValue(new Error('GitHub auth failed'));

    const result = await handleCancelPR('/tmp/state.json', state, '/workspace', '1');

    expect(result.content[0]?.text).toContain('Failed to cancel PR for #1');
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(deleteReviewCache).not.toHaveBeenCalled();
    expect(writeState).not.toHaveBeenCalled();
    expect(state.cards[0]).toMatchObject({
      column: 'review',
      status: 'waiting-input',
      prUrl: 'https://github.com/monobyte/sero/pull/87',
      prNumber: 87,
    });
  });

  it('surfaces cleanup warnings in the tool result and error log', async () => {
    const { handleCancelPR } = await import('../review-actions');
    const state = makeState(makeCard());
    removeWorktree.mockResolvedValue(['git worktree prune failed: locked worktree']);
    deleteReviewCache.mockResolvedValue(['Review cache cleanup failed for cache.json: permission denied']);

    const result = await handleCancelPR('/tmp/state.json', state, '/workspace', '1');
    const text = result.content[0]?.text ?? '';

    expect(text).toContain('Cleanup warnings');
    expect(text).toContain('git worktree prune failed');
    expect(text).toContain('Review cache cleanup failed');
    expect(appendError).toHaveBeenCalledWith('/tmp/state.json', expect.objectContaining({
      agentName: 'system',
      severity: 'warning',
      message: 'git worktree prune failed: locked worktree',
    }));
    expect(appendError).toHaveBeenCalledWith('/tmp/state.json', expect.objectContaining({
      agentName: 'system',
      severity: 'warning',
      message: 'Review cache cleanup failed for cache.json: permission denied',
    }));
  });
});
