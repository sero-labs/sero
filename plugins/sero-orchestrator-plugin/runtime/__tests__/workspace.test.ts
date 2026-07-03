import { describe, expect, it } from 'vitest';
import { resolve, worktreeKeyFor } from '../workspace';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { Loop, LoopRun } from '../../shared/types';

function workspaceRootLoop(loop: Loop): Loop {
  return { ...loop, workspace: { ...loop.workspace, useManagedWorktree: false } };
}

function recurring(loop: Loop): Loop {
  return {
    ...loop,
    triggers: [{ id: 't1', loopId: loop.id, workspaceId: loop.workspaceId, type: 'cron', schedule: '0 * * * *', nextFireAt: '2999-01-01T00:00:00Z', fireCount: 0 }],
  };
}

function stubRuns(n: number): LoopRun[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `run-${i}`, runNumber: i + 1, status: 'completed' as const,
    startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't',
  }));
}

function allowDirtyLoop(loop: Loop): Loop {
  return { ...loop, workspace: { ...loop.workspace, useManagedWorktree: false, allowDirtyWorkspaceRoot: true } };
}

describe('workspace resolution', () => {
  it('managed-worktree loops create a worktree without a dirty prompt', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    const seeded = seedActiveLoop(host, oneStepPlan().plan);
    const loop: Loop = { ...seeded, runtime: { ...seeded.runtime, runSeq: 1 } };
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('managed-worktree');
    expect(host.worktreesCreated).toEqual(['loop-1-r1']); // per-run branch
    expect(host.choiceRequests).toHaveLength(0); // no dirty prompt for managed worktree
  });

  it('reuses an already-resolved workspace', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await resolve(host, loop);
    const second = await resolve(host, first.loop);
    expect(host.worktreesCreated).toHaveLength(1);
    expect(second.workspace?.id).toBe(first.workspace?.id);
  });

  it('workspace-root loops run in the root when clean (no prompt)', async () => {
    const host = createFakeHost();
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('workspace-root');
    expect(result.workspace?.resolvedBy).toBe('clean-workspace');
    expect(host.choiceRequests).toHaveLength(0);
  });

  it('dirty workspace-root shows a choice and creates a worktree on timeout', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: '2 changes' };
    host.choiceResult = { choiceId: null, timedOut: true };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(host.choiceRequests).toHaveLength(1);
    expect(result.workspace?.type).toBe('managed-worktree');
    expect(result.workspace?.resolvedBy).toBe('dirty-workspace-timeout');
  });

  it('dirty workspace-root stash choice stashes and runs in the root', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'stash-current-changes', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(host.stashes).toHaveLength(1);
    expect(result.workspace?.type).toBe('workspace-root');
    expect(result.loop.runtime.workspace.dirtyPrompt?.decision?.action).toBe('stash-current-changes');
  });

  it('dirty workspace-root worktree choice creates a worktree', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'create-managed-worktree', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('managed-worktree');
    expect(result.workspace?.resolvedBy).toBe('dirty-workspace-choice');
  });

  it('allowDirtyWorkspaceRoot runs in the root without a status check or prompt', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    const loop = allowDirtyLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('workspace-root');
    expect(result.workspace?.resolvedBy).toBe('dirty-workspace-allowed');
    expect(host.choiceRequests).toHaveLength(0);
  });

  it('dirty workspace-root "run here" choice runs in the root without stashing or persisting', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'run-in-workspace-root', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('workspace-root');
    expect(host.stashes).toHaveLength(0);
    expect(result.loop.workspace.allowDirtyWorkspaceRoot).toBe(false);
    expect(result.loop.runtime.workspace.dirtyPrompt?.decision?.action).toBe('run-in-workspace-root');
  });

  it('dirty workspace-root "don\'t ask again" choice persists the override on the loop', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'run-in-workspace-root-always', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('workspace-root');
    expect(host.stashes).toHaveLength(0);
    expect(result.loop.workspace.allowDirtyWorkspaceRoot).toBe(true);
  });

  it('dirty workspace-root defer leaves the loop waiting without resolving', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'defer-workflow', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.deferred).toBeTruthy();
    expect(result.workspace).toBeUndefined();
    expect(host.worktreesCreated).toHaveLength(0);
  });
});

describe('event-pr branch resolution (spec 15, FR-P1)', () => {
  function eventPrLoop(loop: Loop): Loop {
    return { ...loop, workspace: { ...loop.workspace, worktreeBranchSource: 'event-pr' as const } };
  }

  function eventRun(payload: Record<string, unknown>): LoopRun {
    return {
      id: 'run-1', runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [], recoveryDecisions: [],
      observations: [{ id: 'obs-1', source: 'event', summary: 'fired', data: payload, createdAt: 't' }], startedAt: 't',
    };
  }

  it('checks out the branch named directly by the firing event', async () => {
    const host = createFakeHost();
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ branch: 'feat/broken-ci', prNumbers: [12] }));
    expect(host.worktreeCreates).toEqual([{ loopId: worktreeKeyFor(loop), existingBranch: 'feat/broken-ci' }]);
    expect(result.workspace?.branchName).toBe('feat/broken-ci');
    expect(result.workspace?.externalBranch).toBe(true);
    expect(result.blocked).toBeUndefined();
  });

  it('resolves a PR number through the open-PR list when the event has no branch', async () => {
    const host = createFakeHost();
    host.pullRequests = [{ number: 12, url: 'https://x/pr/12', title: 'Fix', headRefName: 'feat/from-pr-12', updatedAt: 't' }];
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ prNumber: 12, author: 'ann' }));
    expect(result.workspace?.branchName).toBe('feat/from-pr-12');
  });

  it('blocks visibly when the run was not event-fired — never a fresh-branch fallback', async () => {
    const host = createFakeHost();
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, undefined);
    expect(result.blocked).toContain('not started by an event');
    expect(result.workspace).toBeUndefined();
    expect(host.worktreesCreated).toHaveLength(0);
  });

  it('blocks when the PR number is not in the open-PR list', async () => {
    const host = createFakeHost();
    host.pullRequests = [];
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ prNumber: 99 }));
    expect(result.blocked).toContain('PR #99');
    expect(host.worktreesCreated).toHaveLength(0);
  });

  it('blocks when the event names neither branch nor PR number', async () => {
    const host = createFakeHost();
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ count: 3 }));
    expect(result.blocked).toContain('neither a branch nor a PR number');
  });

  it('blocks with the checkout error when the branch cannot be checked out', async () => {
    const host = createFakeHost();
    host.createWorktree = async () => {
      throw new Error('Branch "gone" exists neither locally nor on origin');
    };
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ branch: 'gone' }));
    expect(result.blocked).toContain('exists neither locally nor on origin');
  });
});

describe('worktreeKeyFor', () => {
  it('keys a one-shot loop by its run counter so each fresh run gets its own branch (not a reuse of the prior run)', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    expect(worktreeKeyFor({ ...loop, runtime: { ...loop.runtime, runSeq: 1 } })).toBe('loop-1-r1');
    // A manual "Run again" increments the counter → a new branch off base, not r1 reused.
    expect(worktreeKeyFor({ ...loop, runtime: { ...loop.runtime, runSeq: 2 } })).toBe('loop-1-r2');
  });

  it('keys a recurring iteration by the monotonic run counter, not runs.length', () => {
    const host = createFakeHost();
    const base = recurring(seedActiveLoop(host, oneStepPlan().plan));
    // Run history is pruned to a fixed retention, so two later iterations share
    // the same runs.length — but the monotonic runSeq differs, so the worktree
    // keys (and thus branch names / PRs) stay distinct.
    const iterA: Loop = { ...base, runs: stubRuns(20), runtime: { ...base.runtime, runSeq: 21 } };
    const iterB: Loop = { ...base, runs: stubRuns(20), runtime: { ...base.runtime, runSeq: 22 } };
    expect(worktreeKeyFor(iterA)).toBe('loop-1-r21');
    expect(worktreeKeyFor(iterB)).toBe('loop-1-r22');
    expect(worktreeKeyFor(iterA)).not.toBe(worktreeKeyFor(iterB));
  });
});
