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

  it('records the lease its checkout is held under and proves it before reusing it', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await resolve(host, loop);
    expect(first.workspace?.slotId).toBeTruthy();
    expect(first.workspace?.leaseId).toBeTruthy();

    await resolve(host, first.loop);
    expect(host.worktreeReattaches).toEqual([{
      kind: 'lease',
      holder: first.workspace?.worktreeKey,
      slotId: first.workspace?.slotId,
      leaseId: first.workspace?.leaseId,
    }]);
  });

  it('blocks the run when a persisted checkout cannot be proved, and mints nothing', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await resolve(host, loop);
    // The lease is gone from under the run — a restart into a repository whose
    // evidence no longer matches.
    host.leases.clear();

    const second = await resolve(host, first.loop);

    expect(second.workspace).toBeUndefined();
    expect(second.blocked).toContain('could not be verified');
    expect(host.worktreesCreated).toHaveLength(1);
  });

  it('adopts a pre-pool checkout through the host and persists its migration lease', async () => {
    const host = createFakeHost();
    const seeded = seedActiveLoop(host, oneStepPlan().plan);
    const legacyPath = `${host.workspacePath}/.sero/worktrees/card-loop-1-r1`;
    const loop: Loop = {
      ...seeded,
      runtime: {
        ...seeded.runtime,
        workspace: {
          ...seeded.runtime.workspace,
          resolved: {
            id: 'ws-legacy',
            type: 'managed-worktree',
            workspaceRoot: host.workspacePath,
            cwd: legacyPath,
            worktreePath: legacyPath,
            branchName: 'fix/legacy-loop-1-r1',
            worktreeKey: 'loop-1-r1',
            resolvedBy: 'create-option',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        },
      },
    };

    const result = await resolve(host, loop);

    expect(host.worktreeReattaches).toEqual([{
      kind: 'legacy',
      holder: 'loop-1-r1',
      worktreePath: legacyPath,
      branchName: 'fix/legacy-loop-1-r1',
    }]);
    expect(result.workspace?.leaseId).toBeTruthy();
    expect(result.loop.runtime.workspace.resolved?.slotId).toBe(result.workspace?.slotId);
    expect(host.worktreesCreated).toHaveLength(0);
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
    expect(host.choiceRequests[0].context).toEqual({
      source: 'Sero Orchestrator',
      workspaceId: 'ws-1',
      trigger: 'Loop',
    });
    expect(host.choiceRequests[0].openTarget?.params).toEqual({ loopId: loop.id });
    expect(host.choiceRequests[0].choices.some((choice) => choice.menu === 'Snooze')).toBe(true);
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

  it('dirty workspace-root skip records a skipped disposition without resolving', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'defer-workflow', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop);
    expect(result.deferred).toEqual({
      status: 'skipped',
      reason: 'User skipped the run because the workspace has uncommitted changes.',
    });
    expect(result.workspace).toBeUndefined();
    expect(host.worktreesCreated).toHaveLength(0);
    expect(result.loop.runtime.workspace.deferredReason).toBeUndefined();
  });

  it('scheduled dirty-workspace runs can be snoozed durably', async () => {
    const host = createFakeHost();
    host.frozenNow = '2026-06-22T10:00:00.000Z';
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: '2 changes' };
    host.choiceResult = { choiceId: 'snooze-1h', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const run = stubRuns(1)[0];
    const result = await resolve(host, loop, { ...run, status: 'running', triggerId: 'cron-1' });

    expect(result.loop.runtime.snoozedUntil).toBe('2026-06-22T11:00:00.000Z');
    expect(result.loop.runtime.pendingTriggerId).toBe('cron-1');
    expect(result.deferred).toEqual({
      status: 'snoozed',
      reason: 'User snoozed the run because the workspace has uncommitted changes.',
      retryAt: '2026-06-22T11:00:00.000Z',
    });
    expect(result.loop.runtime.workspace.deferredReason).toBeUndefined();
    expect(host.choiceRequests[0].context?.trigger).toBe('Scheduled loop');
    expect(host.choiceRequests[0].choices.some((choice) => choice.menu === 'Snooze')).toBe(true);
  });

  it('manually forced dirty-workspace runs can be snoozed', async () => {
    const host = createFakeHost();
    host.frozenNow = '2026-06-22T10:00:00.000Z';
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'snooze-15m', timedOut: false };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));

    const result = await resolve(host, loop, stubRuns(1)[0]);

    expect(result.deferred).toMatchObject({ status: 'snoozed', retryAt: '2026-06-22T10:15:00.000Z' });
    expect(result.loop.runtime.pendingTriggerId).toBeUndefined();
  });

  it('does not offer snooze when retrying would lose an event payload', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    const loop = workspaceRootLoop(seedActiveLoop(host, oneStepPlan().plan));
    const run: LoopRun = {
      ...stubRuns(1)[0],
      status: 'running',
      firedBy: { source: 'github:main-updated', occurredAt: 't', summary: 'main updated' },
    };

    await resolve(host, loop, run);

    expect(host.choiceRequests[0].choices.some((choice) => choice.menu === 'Snooze')).toBe(false);
  });
});

describe('event-pr branch resolution (spec 15, FR-P1)', () => {
  function eventPrLoop(loop: Loop): Loop {
    return { ...loop, workspace: { ...loop.workspace, worktreeBranchSource: 'event-pr' as const } };
  }

  function eventRun(payload: Record<string, unknown>, source = 'github:ci-failed'): LoopRun {
    return {
      id: 'run-1', runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [], recoveryDecisions: [],
      firedBy: { source, occurredAt: 't', summary: 'fired' },
      observations: [{ id: 'obs-1', source: 'event', summary: 'fired', data: payload, createdAt: 't' }], startedAt: 't',
    };
  }

  it('checks out the branch named directly by the firing event', async () => {
    const host = createFakeHost();
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ branch: 'feat/broken-ci', prNumbers: [12] }));
    expect(host.worktreeCreates).toEqual([{
      loopId: worktreeKeyFor(loop),
      existingBranch: 'feat/broken-ci',
      pullRequestNumber: 12,
    }]);
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
    expect(host.worktreeCreates[0]?.pullRequestNumber).toBe(12);
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

  it('blocks a non-PR event even though its payload carries a branch field (main-updated names the DEFAULT branch)', async () => {
    const host = createFakeHost();
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ branch: 'main', afterSha: 'abc123' }, 'github:main-updated'));
    expect(result.blocked).toContain('not scoped to a pull request');
    expect(result.workspace).toBeUndefined();
    expect(host.worktreesCreated).toHaveLength(0);
  });

  it('a PR-number event never trusts a generic branch field — resolution goes through the open-PR list', async () => {
    const host = createFakeHost();
    host.pullRequests = [{ number: 7, url: 'https://x/pr/7', title: 'Fix', headRefName: 'feat/real-head', updatedAt: 't' }];
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ branch: 'main', prNumber: 7 }, 'github:pr-approved'));
    expect(result.workspace?.branchName).toBe('feat/real-head');
  });

  it('blocks with a distinct reason when the open-PR list cannot be read (not "PR not open")', async () => {
    const host = createFakeHost();
    host.listPullRequests = async () => {
      throw new Error('gh exited 4: network unreachable');
    };
    const loop = eventPrLoop(seedActiveLoop(host, oneStepPlan().plan));
    const result = await resolve(host, loop, eventRun({ prNumber: 12 }));
    expect(result.blocked).toContain('Could not read the open pull-request list');
    expect(result.blocked).toContain('gh exited 4');
    expect(host.worktreesCreated).toHaveLength(0);
  });

  it('blocks with the checkout error when the branch cannot be checked out', async () => {
    const host = createFakeHost();
    host.acquireWorktree = async () => ({
      status: 'blocked',
      reason: 'Branch "gone" exists neither locally nor on origin',
    });
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
