/**
 * Reusable PlanningResponse fixtures for tests. Returned as JSON strings so they
 * can be fed straight into the fake host's scripted model responses.
 */

import type { PlanningResponse } from '../../shared/types';

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
