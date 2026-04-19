import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

vi.mock('@electron/features/kanban/implementation/live-output-bridge', () => ({
  bridgeSubagentLiveOutput: vi.fn(() => vi.fn()),
}));

vi.mock('@electron/features/workspace/runtime/verification', () => ({
  detectVerificationCommands: vi.fn().mockResolvedValue([]),
  runVerificationCommands: vi.fn(),
  summarizeVerificationFailure: vi.fn((entry: { command: string }) => entry.command),
}));

vi.mock('@electron/features/kanban/review/workflow/light-review', () => ({
  shouldUseLightReview: vi.fn(() => false),
}));

vi.mock('@electron/features/kanban/review/workflow/light-review-workflow', () => ({
  runLightReviewWorkflow: vi.fn(),
}));

vi.mock('@electron/features/kanban/worktree/worktree-git', () => ({
  createCheckpointInWorktree: vi.fn().mockResolvedValue('checkpoint-1'),
  ensureRemoteDefaultBranch: vi.fn().mockResolvedValue('main'),
  getWorktreeDiff: vi.fn().mockResolvedValue('diff --git a/src/App.tsx b/src/App.tsx'),
  getWorktreeDiffSummary: vi.fn().mockResolvedValue('src/App.tsx'),
  pushWorktreeBranch: vi.fn().mockResolvedValue(true),
  createPrFromWorktree: vi.fn().mockResolvedValue({
    success: true,
    url: 'https://github.com/monobyte/example/pull/1',
    number: 1,
  }),
}));

vi.mock('@electron/features/kanban/core/contracts', () => ({
  getContract: vi.fn(() => ({
    qualityGates: [{ type: 'agent-review', agent: 'reviewer', blocking: true }],
  })),
}));

vi.mock('@electron/features/kanban/review/workflow/review-branch-sync', () => ({
  syncReviewBranchWithDefault: vi.fn().mockResolvedValue({
    success: true,
    invalidatedReviewCache: false,
  }),
}));

vi.mock('@electron/features/kanban/review/workflow/review-preview', () => ({
  startCardReviewPreview: vi.fn().mockResolvedValue({
    previewServerId: 'workspace-1:card-preview:1:4173',
    previewUrl: 'http://127.0.0.1:4173',
  }),
}));

import { executeReview } from '@electron/features/kanban/review/workflow/review-executor';
import { createPrFromWorktree } from '@electron/features/kanban/worktree/worktree-git';
import type { Card, KanbanSettings } from '@electron/features/kanban/core/types';
import type { ReviewProgressTracker } from '@electron/features/kanban/review/state/review-progress';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kanban-review-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '1',
    title: 'Review feature',
    description: 'Implement review feature',
    acceptance: ['Feature works'],
    priority: 'medium',
    column: 'review',
    status: 'agent-working',
    subtasks: [
      {
        id: '1',
        title: 'Ship feature',
        description: 'Build the feature',
        status: 'completed',
        dependsOn: [],
        filePaths: ['src/App.tsx'],
      },
    ],
    plan: 'Build and review the feature.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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
    reviewMode: 'full',
    testingEnabled: true,
    yoloMode: false,
    yoloAutoMergePrs: false,
    ...overrides,
  };
}

describe('executeReview', () => {
  it('uses the structured review submission tool when the reviewer calls it', async () => {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    const worktreePath = path.join(workspaceRoot, '.sero', 'worktrees', 'card-1');
    await fs.mkdir(worktreePath, { recursive: true });

    const runSingleStructured = vi.fn().mockImplementation(async (params: { customTools?: ToolDefinition[] }) => {
      const tool = params.customTools?.find((entry) => entry.name === 'kanban_submit_review');
      expect(tool).toBeDefined();
      await tool!.execute('tool-call-1', {
        approved: true,
        summary: 'Looks good.',
        verdict: 'merge',
        categorizedIssues: [],
        issues: [],
        prTitle: 'feat: reviewer tool output',
        prBody: '## Summary\n- Uses tool output',
      }, undefined, undefined, {} as never);
      return { response: 'review submitted via tool' };
    });

    const result = await executeReview(
      {
        subagentManager: { runSingleStructured } as never,
        workspaceId: 'workspace-1',
        settings: makeSettings(),
      },
      makeCard(),
      worktreePath,
      'feat/review-feature-1',
      makeTracker(),
    );

    expect(result).toMatchObject({
      success: true,
      prUrl: 'https://github.com/monobyte/example/pull/1',
      prNumber: 1,
      previewServerId: 'workspace-1:card-preview:1:4173',
      previewUrl: 'http://127.0.0.1:4173',
    });
    expect(runSingleStructured).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createPrFromWorktree)).toHaveBeenCalledWith(worktreePath, {
      title: 'feat: reviewer tool output',
      body: '## Summary\n- Uses tool output',
      baseBranch: 'main',
    });

    const reviewFile = path.join(workspaceRoot, '.sero', 'apps', 'kanban', 'reviews', 'card-1.json');
    const saved = JSON.parse(await fs.readFile(reviewFile, 'utf8')) as { prTitle: string; summary: string };
    expect(saved.prTitle).toBe('feat: reviewer tool output');
    expect(saved.summary).toBe('Looks good.');
  });

  it('ignores stale cached review files when the card no longer points at them', async () => {
    const workspaceRoot = path.join(tmpDir, 'workspace');
    const worktreePath = path.join(workspaceRoot, '.sero', 'worktrees', 'card-1');
    const reviewFile = path.join(workspaceRoot, '.sero', 'apps', 'kanban', 'reviews', 'card-1.json');
    await fs.mkdir(path.dirname(reviewFile), { recursive: true });
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.writeFile(reviewFile, JSON.stringify({
      prTitle: 'feat: stale cache',
      prBody: 'stale body',
      summary: 'stale summary',
      approved: true,
      verdict: 'merge',
      categorizedIssues: [],
      issues: [],
    }), 'utf8');

    const runSingleStructured = vi.fn().mockImplementation(async (params: { customTools?: ToolDefinition[] }) => {
      const tool = params.customTools?.find((entry) => entry.name === 'kanban_submit_review');
      await tool!.execute('tool-call-1', {
        approved: true,
        summary: 'fresh summary',
        verdict: 'merge',
        categorizedIssues: [],
        issues: [],
        prTitle: 'feat: fresh review',
        prBody: 'fresh body',
      }, undefined, undefined, {} as never);
      return { response: 'fresh review submitted via tool' };
    });

    await executeReview(
      {
        subagentManager: { runSingleStructured } as never,
        workspaceId: 'workspace-1',
        settings: makeSettings(),
      },
      makeCard({ reviewFilePath: undefined }),
      worktreePath,
      'feat/review-feature-1',
      makeTracker(),
    );

    expect(runSingleStructured).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createPrFromWorktree)).toHaveBeenLastCalledWith(worktreePath, {
      title: 'feat: fresh review',
      body: 'fresh body',
      baseBranch: 'main',
    });
  });
});
