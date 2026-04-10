import { describe, expect, it, vi } from 'vitest';

import { runLightReviewWorkflow } from '@electron/features/kanban/review/workflow/light-review-workflow';
import type { ReviewResult } from '@electron/features/kanban/prompts';
import type { Card, KanbanSettings } from '@electron/features/kanban/core/types';
import type { ReviewProgressTracker } from '@electron/features/kanban/review/state/review-progress';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Test feature',
    description: 'Implement test feature',
    acceptance: ['Feature works'],
    priority: 'medium',
    column: 'review',
    status: 'agent-working',
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    branch: 'feat/test-feature-1',
    worktreePath: '/tmp/worktree',
    ...overrides,
  };
}

function makeTracker(): ReviewProgressTracker {
  return {
    setPhase: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    addAgent: vi.fn(),
    completeAgent: vi.fn(),
    addLogLine: vi.fn(),
  } as unknown as ReviewProgressTracker;
}

function makeSettings(overrides: Partial<KanbanSettings> = {}): KanbanSettings {
  return {
    autoAdvance: true,
    maxConcurrentCards: 3,
    requireApproval: { plan: true, pr: true },
    reviewLevel: 'per-wave',
    reviewMode: 'light',
    testingEnabled: false,
    yoloMode: true,
    yoloAutoMergePrs: false,
    ...overrides,
  };
}

const approvedReview: ReviewResult = {
  approved: true,
  summary: 'ok',
  issues: [],
  categorizedIssues: [],
  verdict: 'merge',
  prTitle: 'feat: test feature',
  prBody: 'body',
};

describe('runLightReviewWorkflow', () => {
  it('retries once after an automatic repair and returns the rerun review', async () => {
    const executeReview = vi
      .fn()
      .mockResolvedValueOnce({ success: false, error: 'compile failed' })
      .mockResolvedValueOnce({ success: true, review: approvedReview });
    const repairFailure = vi.fn().mockResolvedValue({ success: true });

    const result = await runLightReviewWorkflow(
      {
        subagentManager: {} as never,
        workspaceId: 'workspace-1',
        settings: makeSettings(),
      },
      makeCard(),
      '/tmp/worktree',
      makeTracker(),
      'parent-session',
      { executeReview, repairFailure },
    );

    expect(result).toEqual({ success: true, review: approvedReview });
    expect(executeReview).toHaveBeenCalledTimes(2);
    expect(repairFailure).toHaveBeenCalledTimes(1);
  });

  it('returns the repair error when automatic repair fails', async () => {
    const executeReview = vi.fn().mockResolvedValue({ success: false, error: 'compile failed' });
    const repairFailure = vi.fn().mockResolvedValue({ success: false, error: 'repair failed' });

    const result = await runLightReviewWorkflow(
      {
        subagentManager: {} as never,
        workspaceId: 'workspace-1',
        settings: makeSettings(),
      },
      makeCard(),
      '/tmp/worktree',
      makeTracker(),
      'parent-session',
      { executeReview, repairFailure },
    );

    expect(result).toEqual({ success: false, error: 'repair failed' });
    expect(executeReview).toHaveBeenCalledTimes(1);
    expect(repairFailure).toHaveBeenCalledTimes(1);
  });
});
