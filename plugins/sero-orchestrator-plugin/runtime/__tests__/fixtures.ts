/**
 * Reusable PlanningResponse fixtures for tests. Returned as JSON strings so they
 * can be fed straight into the fake host's scripted model responses.
 */

import type { Loop, LoopPlan, PlanningResponse } from '../../shared/types';
import { loopParentSessionId } from '../../shared/ids';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY, DEFAULT_WORKSPACE_SETTINGS } from '../../shared/defaults';
import { initStepStates } from '../plan-mapping';
import type { FakeHost } from './fake-host';

export function oneStepPlan(): PlanningResponse {
  return {
    schemaVersion: 1,
    title: 'One step loop',
    summary: 'A single background-agent step.',
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'Do one thing',
      steps: [
        {
          id: 'step-1',
          title: 'Do the work',
          instructions: 'Perform the task.',
          expectedOutcome: 'Task done',
          execution: { type: 'background-agent' },
        },
      ],
    },
  };
}

export function sequentialPlan(): PlanningResponse {
  return {
    schemaVersion: 1,
    title: 'Sequential loop',
    summary: 'Two steps in sequence.',
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'Do two things in order',
      steps: [
        { id: 'a', title: 'First', instructions: 'Do A.', execution: { type: 'background-agent' } },
        { id: 'b', title: 'Second', instructions: 'Do B after A.', dependsOn: ['a'], execution: { type: 'model' } },
      ],
    },
  };
}

export function parallelPlan(): PlanningResponse {
  return {
    schemaVersion: 1,
    title: 'Parallel loop',
    summary: 'A fan-out then a join.',
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'Fan out and join',
      steps: [
        { id: 'root', title: 'Root', instructions: 'Seed.', execution: { type: 'background-agent' } },
        { id: 'left', title: 'Left', instructions: 'Branch L.', dependsOn: ['root'], execution: { type: 'background-agent' } },
        { id: 'right', title: 'Right', instructions: 'Branch R.', dependsOn: ['root'], execution: { type: 'background-agent' } },
        { id: 'join', title: 'Join', instructions: 'Combine.', dependsOn: ['left', 'right'], execution: { type: 'model' } },
      ],
    },
  };
}

export function planJson(response: PlanningResponse): string {
  return JSON.stringify(response);
}

/** Seeds an active loop with the given plan directly into the fake host state. */
export function seedActiveLoop(host: FakeHost, plan: LoopPlan, id = 'loop-1'): Loop {
  const now = host.now();
  const loop: Loop = {
    id,
    workspaceId: host.workspaceId,
    title: 'Seeded',
    prompt: 'p',
    summary: 's',
    status: 'active',
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
    plan,
    runtime: {
      parentSessionId: loopParentSessionId(host.workspaceId, id),
      variables: {},
      stepStates: initStepStates(plan, now),
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
  host.state = { ...host.state, loops: [...host.state.loops, loop] };
  return loop;
}
