import { describe, expect, it } from 'vitest';
import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import { mapEdgeState, mapRouteState } from '../lib/plan-map-state';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY, DEFAULT_WORKSPACE_SETTINGS } from '../../shared/defaults';

const step = (
  id: string,
  extra: Partial<LoopStepDefinition> = {},
): LoopStepDefinition => ({
  id,
  title: id,
  instructions: id,
  execution: { type: 'background-agent' },
  ...extra,
});

function loopWith(steps: LoopStepDefinition[], statuses: Record<string, StepStatus> = {}): Loop {
  const now = '2026-07-27T00:00:00.000Z';
  return {
    id: 'map',
    workspaceId: 'workspace',
    title: 'Map',
    prompt: 'Map',
    summary: 'Map',
    status: 'active',
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
    plan: { schemaVersion: 1, revision: 1, objective: 'Map', steps },
    runtime: {
      parentSessionId: 'parent',
      variables: {},
      stepStates: Object.fromEntries(steps.map((candidate) => [
        candidate.id,
        { status: statuses[candidate.id] ?? 'pending', attempts: 0, updatedAt: now },
      ])),
      workspace: {},
    },
    triggers: [],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    warnings: [],
    runs: [],
    revisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('plan map runtime state', () => {
  it('keeps guarded routes undecided until their variable exists', () => {
    const guarded = step('guarded', { when: { var: 'route', in: ['yes'] } });
    expect(mapRouteState(loopWith([guarded]), guarded)).toBe('undecided');
  });

  it('marks only the matching branch as taken', () => {
    const yes = step('yes', { when: { var: 'route', in: ['yes'] } });
    const fallback = step('fallback', { when: { var: 'route', default: true } });
    const loop = loopWith([yes, fallback]);
    loop.runtime.variables.route = 'yes';
    expect(mapRouteState(loop, yes)).toBe('taken');
    expect(mapRouteState(loop, fallback)).toBe('not-taken');
  });

  it('takes the default route for an unlisted value', () => {
    const explicit = step('explicit', { when: { var: 'route', in: ['known'] } });
    const fallback = step('fallback', { when: { var: 'route', default: true } });
    const loop = loopWith([explicit, fallback]);
    loop.runtime.variables.route = 'other';
    expect(mapRouteState(loop, fallback)).toBe('taken');
  });

  it('uses the destination status to colour an edge', () => {
    const loop = loopWith([step('a'), step('b')], { a: 'succeeded', b: 'running' });
    expect(mapEdgeState(loop, 'a', 'b')).toBe('running');
    loop.runtime.stepStates.b.status = 'skipped';
    expect(mapEdgeState(loop, 'a', 'b')).toBe('skipped');
  });
});
