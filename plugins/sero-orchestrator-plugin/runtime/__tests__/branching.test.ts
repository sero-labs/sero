import { describe, expect, it } from 'vitest';
import { resolveBranchSkips } from '../branching';
import { computeReadySteps } from '../readiness';
import type { Loop, LoopStepDefinition, StepOutcome, StepRuntimeState } from '../../shared/types';

function step(id: string, extra: Partial<LoopStepDefinition> = {}): LoopStepDefinition {
  return { id, title: id, instructions: 'do', execution: { type: 'background-agent' }, ...extra };
}

const succeeded: StepOutcome = { status: 'succeeded', summary: 'ok' };

function mkLoop(
  steps: LoopStepDefinition[],
  states: Record<string, Partial<StepRuntimeState>>,
  variables: Record<string, unknown> = {},
): Loop {
  const stepStates: Record<string, StepRuntimeState> = {};
  for (const s of steps) {
    const st = states[s.id] ?? {};
    stepStates[s.id] = { status: st.status ?? 'pending', attempts: 0, outcome: st.outcome, updatedAt: 't' };
  }
  return {
    id: 'l', workspaceId: 'ws', title: 't', prompt: 'p', summary: '', status: 'active',
    workspace: { useManagedWorktree: true, reuseExistingWorktree: true, dirtyWorkspacePromptTimeoutMs: 0, dirtyWorkspaceDefaultAction: 'create-managed-worktree', allowDirtyWorkspaceRoot: false },
    plan: { schemaVersion: 1, revision: 0, objective: 'o', steps },
    runtime: { parentSessionId: 'pid', variables, stepStates, workspace: {} },
    triggers: [], limits: { maxConcurrentSteps: 5 }, logPolicy: { retainRuns: 5, retainArtifacts: true, maxInlineOutputBytes: 100 },
    warnings: [], runs: [], revisions: [], createdAt: 't', updatedAt: 't',
  };
}

const statusOf = (loop: Loop, id: string) => loop.runtime.stepStates[id].status;

describe('resolveBranchSkips', () => {
  it('skips the un-taken alternative and keeps the taken one (switch)', () => {
    const steps = [
      step('judge', { produces: ['route'] }),
      step('a', { dependsOn: ['judge'], when: { var: 'route', in: ['x'] } }),
      step('b', { dependsOn: ['judge'], when: { var: 'route', in: ['y'] } }),
      step('end', { dependsOn: ['a', 'b'] }),
    ];
    const r = resolveBranchSkips(mkLoop(steps, { judge: { status: 'succeeded', outcome: succeeded } }, { route: 'x' }), 'now');
    expect(statusOf(r, 'a')).toBe('pending'); // taken
    expect(statusOf(r, 'b')).toBe('skipped'); // route did not match
  });

  it('skips every step of an un-taken multi-step branch (each via its own guard)', () => {
    const steps = [
      step('judge', { produces: ['route'] }),
      step('a', { dependsOn: ['judge'], when: { var: 'route', in: ['x'] } }),
      step('b1', { dependsOn: ['judge'], when: { var: 'route', in: ['y'] } }),
      step('b2', { dependsOn: ['b1'], when: { var: 'route', in: ['y'] } }),
      step('end', { dependsOn: ['a', 'b2'] }),
    ];
    const r = resolveBranchSkips(mkLoop(steps, { judge: { status: 'succeeded', outcome: succeeded } }, { route: 'x' }), 'now');
    expect(statusOf(r, 'b1')).toBe('skipped');
    expect(statusOf(r, 'b2')).toBe('skipped');
    expect(statusOf(r, 'a')).toBe('pending');
  });

  it('runs the unguarded main line past a skipped optional step', () => {
    const steps = [
      step('judge', { produces: ['needsPlanning'] }),
      step('planning', { dependsOn: ['judge'], when: { var: 'needsPlanning', in: [true] } }),
      step('implement', { dependsOn: ['planning'] }),
      step('finalize', { dependsOn: ['implement'] }),
    ];
    const r = resolveBranchSkips(mkLoop(steps, { judge: { status: 'succeeded', outcome: succeeded } }, { needsPlanning: false }), 'now');
    expect(statusOf(r, 'planning')).toBe('skipped');
    expect(statusOf(r, 'implement')).toBe('pending'); // unguarded → not skipped
    expect(computeReadySteps(r)).toContain('implement'); // skipped dep satisfies it → ready
  });

  it('takes a default branch only when no in-guard matched', () => {
    const steps = [
      step('judge', { produces: ['route'] }),
      step('a', { dependsOn: ['judge'], when: { var: 'route', in: ['x'] } }),
      step('fallback', { dependsOn: ['judge'], when: { var: 'route', default: true } }),
      step('end', { dependsOn: ['a', 'fallback'] }),
    ];
    const unmatched = resolveBranchSkips(mkLoop(steps, { judge: { status: 'succeeded', outcome: succeeded } }, { route: 'weird' }), 'now');
    expect(statusOf(unmatched, 'a')).toBe('skipped');
    expect(statusOf(unmatched, 'fallback')).toBe('pending'); // default taken

    const matched = resolveBranchSkips(mkLoop(steps, { judge: { status: 'succeeded', outcome: succeeded } }, { route: 'x' }), 'now');
    expect(statusOf(matched, 'a')).toBe('pending');
    expect(statusOf(matched, 'fallback')).toBe('skipped'); // an in-guard matched
  });

  it('skips a nested branch when its outer route was not taken (routing var stays unset)', () => {
    const steps = [
      step('judge1', { produces: ['route1'] }),
      step('judge2', { dependsOn: ['judge1'], when: { var: 'route1', in: ['complex'] }, produces: ['route2'] }),
      step('x', { dependsOn: ['judge2'], when: { var: 'route2', in: ['a'] } }),
      step('end', { dependsOn: ['x'] }),
    ];
    const r = resolveBranchSkips(mkLoop(steps, { judge1: { status: 'succeeded', outcome: succeeded } }, { route1: 'simple' }), 'now');
    expect(statusOf(r, 'judge2')).toBe('skipped');
    expect(statusOf(r, 'x')).toBe('skipped'); // route2 never set → not taken
    expect(statusOf(r, 'end')).toBe('pending'); // unguarded convergence still runs
  });

  it('does not skip a guarded step before its route is decided (and is a no-op)', () => {
    const steps = [
      step('judge', { produces: ['route'] }),
      step('a', { dependsOn: ['judge'], when: { var: 'route', in: ['x'] } }),
      step('end', { dependsOn: ['a'] }),
    ];
    // judge has not run yet (pending, no outcome) → a's deps unresolved → not evaluated.
    const loop = mkLoop(steps, {}, {});
    const r = resolveBranchSkips(loop, 'now');
    expect(statusOf(r, 'a')).toBe('pending');
    expect(r).toBe(loop); // nothing changed → same reference
  });
});
