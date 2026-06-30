/**
 * End-to-end human-input flows through the REAL runtime — the actual Coordinator,
 * run engine, dispatch executors, and StepOutcome / planner parsing (only the
 * host and the model replies are faked). Proves the full park → answer → resume
 * path for a step question and the create → answer → re-plan path for the planner.
 */

import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { createEngineDeps } from '../executors';
import { LoopLocks } from '../locks';
import { llmStopChecker } from '../stop-condition';
import type { LoopPlan } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, planJson, seedActiveLoop } from './fixtures';

function realCoordinator(host: FakeHost): Coordinator {
  return new Coordinator(host, createEngineDeps(new LoopLocks(), { stopChecker: llmStopChecker }));
}

// A two-step plan: a background-agent that asks, then a model finalize step.
const askPlan: LoopPlan = {
  schemaVersion: 1,
  revision: 0,
  objective: 'Apply the billing migration',
  steps: [
    { id: 'apply', title: 'Apply migration', instructions: 'Run the migration.', execution: { type: 'background-agent' } },
    { id: 'finalize', title: 'Finalize', instructions: 'Confirm and finish.', dependsOn: ['apply'], execution: { type: 'model' } },
  ],
};

const ASK_REPLY = [
  'I inspected the migration. It drops `invoices_old` (12,400 rows) — a destructive change I should confirm first.',
  '',
  '```json',
  '{ "status": "needs-revision", "summary": "waiting on confirmation to drop the legacy table",',
  '  "questions": [ { "prompt": "Drop invoices_old (12,400 rows), or keep it?", "choices": ["Drop it", "Keep it"] } ] }',
  '```',
].join('\n');

const DID_WORK = '```json\n{ "status": "succeeded", "summary": "migration applied" }\n```';
const DONE = '```json\n{ "status": "succeeded", "summary": "verified", "completion": { "status": "complete", "reason": "billing tables migrated" } }\n```';

describe('human input — end to end (real runtime)', () => {
  it('a step asks → loop parks → user answers → step re-runs → loop completes', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, askPlan);
    const coordinator = realCoordinator(host);

    // 1. Run. The 'apply' step asks; the loop parks.
    host.modelResponses.push({ response: ASK_REPLY });
    await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });

    let loop = host.state.loops[0];
    expect(loop.runtime.pendingInput?.source).toBe('step');
    expect(loop.runtime.pendingInput?.stepId).toBe('apply');
    expect(loop.runtime.pendingInput?.questions[0].choices).toHaveLength(2);
    expect(loop.runtime.stepStates.apply.status).toBe('pending'); // reset for re-run
    expect(host.notifications.some((n) => n.message.includes('waiting on you'))).toBe(true);
    const requestId = loop.runtime.pendingInput!.id;
    const questionId = loop.runtime.pendingInput!.questions[0].id;

    // 2. While parked, a manual run does nothing.
    const blocked = await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain('waiting for you');

    // 3. Answer. The step re-runs (does the work) and finalize completes the loop.
    host.modelResponses.push({ response: DID_WORK }, { response: DONE });
    await coordinator.requestAction({
      kind: 'answer_input',
      loopId: 'loop-1',
      requestId,
      answers: [{ questionId, choiceId: 'c1' }], // "Drop it"
    });

    loop = host.state.loops[0];
    expect(loop.runtime.pendingInput).toBeUndefined();
    expect(loop.status).toBe('complete');
    expect(loop.runtime.stepStates.apply.status).toBe('succeeded');
    expect(loop.runtime.stepStates.finalize.status).toBe('succeeded');
    expect(loop.answeredInputs).toHaveLength(1);
    // The chosen answer is carried into the loop's shared notes for the re-run.
    expect(String(loop.runtime.variables.notes)).toContain('Drop it');
  });

  it('the planner asks at create → user answers → plan is built', async () => {
    const host = createFakeHost();
    const coordinator = realCoordinator(host);

    // 1. Create with a vague prompt; the planner asks instead of planning.
    host.modelResponses.push({
      response: JSON.stringify({
        clarifyingQuestions: [{ prompt: 'Which database should the migration target?', choices: ['Postgres', 'MySQL'] }],
      }),
    });
    const created = await coordinator.requestAction({ kind: 'create', prompt: 'add the billing migration', options: { activate: true } });
    expect(created.ok).toBe(true);

    let loop = created.loop!;
    expect(loop.status).toBe('draft'); // not activated — parked on a question
    expect(loop.runtime.pendingInput?.source).toBe('planner');
    expect(loop.plan.steps).toHaveLength(0); // no plan yet
    const requestId = loop.runtime.pendingInput!.id;
    const questionId = loop.runtime.pendingInput!.questions[0].id;

    // 2. Answer. The planner re-runs and builds the plan.
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const answered = await coordinator.requestAction({
      kind: 'answer_input',
      loopId: loop.id,
      requestId,
      answers: [{ questionId, text: 'Postgres' }],
    });

    loop = answered.loop!;
    expect(loop.runtime.pendingInput).toBeUndefined();
    expect(loop.plan.steps.length).toBeGreaterThan(0);
    expect(loop.answeredInputs).toHaveLength(1);
    expect(loop.answeredInputs![0].source).toBe('planner');
  });
});
