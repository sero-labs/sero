import { describe, expect, it } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import type { StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, parallelPlan, sequentialPlan, seedActiveLoop } from './fixtures';

const ok = (summary = 'ok'): string => JSON.stringify({ status: 'succeeded', summary } satisfies StepOutcome);

function engineFor(host: FakeHost): RunEngine {
  return new RunEngine(host, createEngineDeps(new LoopLocks()));
}

function workspaceRoot(host: FakeHost) {
  const loop = host.state.loops[0];
  host.state = { ...host.state, loops: [{ ...loop, workspace: { ...loop.workspace, useManagedWorktree: false } }] };
}

describe('Phase 4 — execution + workspace isolation + limits', () => {
  it('runs a one-step background loop in a managed worktree', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.worktreesCreated).toEqual(['loop-1-r1']); // per-run branch (run 1)
    expect(host.modelCalls[0].cwd).toBe(`${host.workspacePath}/.sero/worktrees/loop-1-r1`);
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('reuses one worktree across a sequential plan', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan);
    host.modelResponses.push({ response: ok() }, { response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.worktreesCreated).toEqual(['loop-1-r1']); // created once for the run, reused across steps
  });

  it('does not prompt for a dirty root when using a managed worktree', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.choiceRequests).toHaveLength(0);
    expect(host.worktreesCreated).toEqual(['loop-1-r1']);
  });

  it('runs a workspace-root loop in the root when clean', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    workspaceRoot(host);
    host.modelResponses.push({ response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.choiceRequests).toHaveLength(0);
    expect(host.modelCalls[0].cwd).toBe(host.workspacePath);
  });

  it('prompts on a dirty workspace root and creates a worktree on timeout', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: null, timedOut: true };
    seedActiveLoop(host, oneStepPlan().plan);
    workspaceRoot(host);
    host.modelResponses.push({ response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.choiceRequests).toHaveLength(1);
    expect(host.modelCalls[0].cwd).toBe(`${host.workspacePath}/.sero/worktrees/loop-1-r1`);
  });

  it('stash choice runs in the workspace root', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'stash-current-changes', timedOut: false };
    seedActiveLoop(host, oneStepPlan().plan);
    workspaceRoot(host);
    host.modelResponses.push({ response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.stashes).toHaveLength(1);
    expect(host.modelCalls[0].cwd).toBe(host.workspacePath);
  });

  it('skip choice records an explicit skipped run without starting steps', async () => {
    const host = createFakeHost();
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'defer-workflow', timedOut: false };
    seedActiveLoop(host, oneStepPlan().plan);
    workspaceRoot(host);
    const result = await engineFor(host).run('loop-1');
    expect(host.modelCalls).toHaveLength(0);
    expect(result.run).toMatchObject({
      status: 'skipped',
      statusReason: 'User skipped the run because the workspace has uncommitted changes.',
    });
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('pending');
    expect(host.state.loops[0].runtime.workspace.deferredReason).toBeUndefined();
  });

  it('a manually forced run can record a snoozed run and durable retry time', async () => {
    const host = createFakeHost();
    host.frozenNow = '2026-06-22T10:00:00.000Z';
    host.workspaceStatus = { isGitRepository: true, hasUncommittedChanges: true, summary: 'dirty' };
    host.choiceResult = { choiceId: 'snooze-1h', timedOut: false };
    seedActiveLoop(host, oneStepPlan().plan);
    workspaceRoot(host);

    const result = await engineFor(host).run('loop-1');

    expect(host.modelCalls).toHaveLength(0);
    expect(result.run).toMatchObject({
      status: 'snoozed',
      statusReason: 'User snoozed the run because the workspace has uncommitted changes.',
      retryAt: '2026-06-22T11:00:00.000Z',
    });
    expect(host.state.loops[0].runtime.snoozedUntil).toBe('2026-06-22T11:00:00.000Z');
    expect(host.state.loops[0].runtime.pendingTriggerId).toBeUndefined();
  });

  it('runs a parallel plan to completion', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, parallelPlan().plan);
    host.modelResponses.push({ response: ok() }, { response: ok() }, { response: ok() }, { response: ok() });
    await engineFor(host).run('loop-1');
    expect(host.modelCalls).toHaveLength(4);
    for (const id of ['root', 'left', 'right', 'join']) {
      expect(host.state.loops[0].runtime.stepStates[id].status).toBe('succeeded');
    }
  });

  it('blocks with management-limit when max total attempts is reached', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    host.state = { ...host.state, loops: [{ ...loop, limits: { ...loop.limits, maxAttemptsTotal: 1 } }] };
    host.modelResponses.push({ response: ok() }, { response: ok() });
    await engineFor(host).run('loop-1');
    const blocked = host.state.loops[0];
    expect(blocked.status).toBe('blocked');
    expect(blocked.runtime.block?.kind).toBe('management-limit');
    expect(blocked.runtime.block?.limit).toBe('maxAttemptsTotal');
  });
});
