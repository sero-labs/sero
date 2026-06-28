import { describe, expect, it } from 'vitest';
import { resolve } from '../workspace';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { Loop } from '../../shared/types';

function workspaceRootLoop(loop: Loop): Loop {
  return { ...loop, workspace: { ...loop.workspace, useManagedWorktree: false } };
}

function allowDirtyLoop(loop: Loop): Loop {
  return { ...loop, workspace: { ...loop.workspace, useManagedWorktree: false, allowDirtyWorkspaceRoot: true } };
}

describe('workspace resolution', () => {
  it('managed-worktree loops create a worktree without a dirty prompt', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const result = await resolve(host, loop);
    expect(result.workspace?.type).toBe('managed-worktree');
    expect(host.worktreesCreated).toEqual(['loop-1']);
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
