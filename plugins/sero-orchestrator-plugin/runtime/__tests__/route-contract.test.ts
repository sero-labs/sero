import { describe, expect, it } from 'vitest';
import {
  enforceRouteContract,
  formatRouteContract,
  formatRouteRepair,
  missingRouteVariables,
  routeVariableRequirements,
} from '../route-contract';
import type { Loop, LoopStepDefinition, StepOutcome } from '../../shared/types';

function step(id: string, extra: Partial<LoopStepDefinition> = {}): LoopStepDefinition {
  return { id, title: id, instructions: 'do', execution: { type: 'background-agent' }, ...extra };
}

function mkLoop(steps: LoopStepDefinition[]): Loop {
  return {
    id: 'l', workspaceId: 'ws', title: 't', prompt: 'p', summary: '', status: 'active',
    workspace: { useManagedWorktree: true, reuseExistingWorktree: true, dirtyWorkspacePromptTimeoutMs: 0, dirtyWorkspaceDefaultAction: 'create-managed-worktree', allowDirtyWorkspaceRoot: false },
    plan: { schemaVersion: 1, revision: 0, objective: 'o', steps },
    runtime: { parentSessionId: 'pid', variables: {}, stepStates: {}, workspace: {} },
    triggers: [], limits: { maxConcurrentSteps: 5 }, logPolicy: { retainRuns: 5, retainArtifacts: true, maxInlineOutputBytes: 100 },
    warnings: [], runs: [], revisions: [], createdAt: 't', updatedAt: 't',
  };
}

// A judge that produces `route`, branched on by `a` (in: x) and `b` (default).
const branchedPlan = mkLoop([
  step('judge', { produces: ['route'] }),
  step('a', { dependsOn: ['judge'], when: { var: 'route', in: ['x', 'y'] } }),
  step('b', { dependsOn: ['judge'], when: { var: 'route', default: true } }),
  step('end', { dependsOn: ['a', 'b'] }),
]);
const judge = branchedPlan.plan.steps[0];

const succeeded = (variables?: Record<string, unknown>): StepOutcome => ({ status: 'succeeded', summary: 'ok', variables });

describe('routeVariableRequirements', () => {
  it('collects allowed values and default across sibling guards', () => {
    const reqs = routeVariableRequirements(branchedPlan, judge);
    expect(reqs).toEqual([{ name: 'route', allowed: ['x', 'y'], hasDefault: true }]);
  });

  it('ignores a produced variable no guard reads (advisory only)', () => {
    const loop = mkLoop([step('judge', { produces: ['route', 'notes_count'] }), step('a', { dependsOn: ['judge'], when: { var: 'route', in: ['x'] } }), step('end', { dependsOn: ['a'] })]);
    expect(routeVariableRequirements(loop, loop.plan.steps[0]).map((r) => r.name)).toEqual(['route']);
  });

  it('returns nothing for a step that produces nothing', () => {
    expect(routeVariableRequirements(branchedPlan, branchedPlan.plan.steps[3])).toEqual([]);
  });
});

describe('missingRouteVariables', () => {
  it('flags a succeeded outcome that omitted the routing variable', () => {
    expect(missingRouteVariables(branchedPlan, judge, succeeded({ issueClassifications: [] })).map((r) => r.name)).toEqual(['route']);
  });

  it('passes when the routing variable is recorded (even falsy)', () => {
    expect(missingRouteVariables(branchedPlan, judge, succeeded({ route: false }))).toEqual([]);
    expect(missingRouteVariables(branchedPlan, judge, succeeded({ route: 'x' }))).toEqual([]);
  });

  it('does not enforce on a non-succeeded outcome (skipped/failed legitimately omit it)', () => {
    expect(missingRouteVariables(branchedPlan, judge, { status: 'skipped', summary: 'n/a' })).toEqual([]);
    expect(missingRouteVariables(branchedPlan, judge, { status: 'failed', summary: 'boom' })).toEqual([]);
  });
});

describe('enforceRouteContract', () => {
  it('downgrades a hollow success to needs-revision, keeping recorded variables', () => {
    const out = enforceRouteContract(branchedPlan, judge, succeeded({ issueClassifications: [1, 2] }));
    expect(out.status).toBe('needs-revision');
    expect(out.summary).toContain('route');
    expect(out.variables).toEqual({ issueClassifications: [1, 2] });
  });

  it('passes a compliant success through unchanged', () => {
    const ok = succeeded({ route: 'x' });
    expect(enforceRouteContract(branchedPlan, judge, ok)).toBe(ok);
  });
});

describe('prompt + repair copy', () => {
  it('names the variable and its allowed values in the task contract', () => {
    const text = formatRouteContract(routeVariableRequirements(branchedPlan, judge));
    expect(text).toContain('"route"');
    expect(text).toContain('"x"');
    expect(text).toContain('default route');
  });

  it('builds a repair turn listing the missing variables', () => {
    const missing = missingRouteVariables(branchedPlan, judge, succeeded({}));
    expect(formatRouteRepair(missing)).toContain('"route"');
  });
});
