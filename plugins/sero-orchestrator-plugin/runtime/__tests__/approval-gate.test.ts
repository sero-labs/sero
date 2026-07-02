import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { AnsweredInput, Loop, LoopPlan, StepOutcome } from '../../shared/types';
import { parseHumanQuestions } from '../human-input';
import { approvalGateProblems, validatePlanningResponse, validateLoopPlan } from '../schema';
import { consumeApprovals, deliveryProblems, hasOpenApproval } from '../delivery/delivery-contract';
import { planIsActivatable } from '../plan-mapping';
import { buildStepTask } from '../executors/prompt';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, planJson, seedActiveLoop } from './fixtures';
import { fakeDecider, fakeExecutor } from './engine-fakes';

const WEBHOOK_RECEIPT = {
  destination: 'webhook-post' as const,
  ref: 'POST https://127.0.0.1:9999/hook → 200',
  summary: 'Posted the digest to the webhook',
  deliveredAt: '2026-01-01T00:00:30.000Z',
};

function approvalAnswered(overrides: Partial<AnsweredInput> = {}): AnsweredInput {
  return {
    requestId: 'input_0001',
    source: 'step',
    stepId: 'step-1',
    questions: [{ id: 'q1', prompt: 'Send this?', kind: 'approval', attachment: 'the draft', choices: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }] }],
    answers: [{ questionId: 'q1', choiceId: 'approve' }],
    answeredAt: '2026-01-01T00:00:20.000Z',
    ...overrides,
  };
}

function completing(): StepOutcome {
  return { status: 'succeeded', summary: 'sent', completion: { status: 'complete', reason: 'shipped', receipt: WEBHOOK_RECEIPT } };
}

function seedExternalLoop(host: FakeHost): Loop {
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  loop.delivery = { destination: 'webhook-post', params: { url: 'https://127.0.0.1:9999/hook' } };
  host.state = { ...host.state, loops: [loop] };
  return loop;
}

describe('parseHumanQuestions approval questions', () => {
  it('carries kind and attachment, keeping a compliant approve/reject pair', () => {
    const qs = parseHumanQuestions([
      { prompt: 'Send it?', kind: 'approval', attachment: 'Hello world', choices: [{ id: 'approve', label: 'Ship it' }, { id: 'reject', label: 'Hold' }] },
    ]);
    expect(qs?.[0]).toMatchObject({ kind: 'approval', attachment: 'Hello world' });
    expect(qs?.[0].choices?.map((c) => c.id)).toEqual(['approve', 'reject']);
    expect(qs?.[0].choices?.[0].label).toBe('Ship it');
  });

  it('replaces non-compliant choices with the standard pair (ids are the contract, never labels)', () => {
    const qs = parseHumanQuestions([{ prompt: 'Send it?', kind: 'approval', choices: ['Yes please', 'No'] }]);
    expect(qs?.[0].choices).toEqual([
      { id: 'approve', label: 'Approve' },
      { id: 'reject', label: 'Reject' },
    ]);
  });

  it('leaves ordinary questions untouched', () => {
    const qs = parseHumanQuestions([{ prompt: 'Which db?', choices: ['Postgres', 'MySQL'] }]);
    expect(qs?.[0].kind).toBeUndefined();
    expect(qs?.[0].choices?.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

describe('gate step marker validation', () => {
  const gatedPlan = (): LoopPlan => ({
    schemaVersion: 1, revision: 0, objective: 'ship a digest',
    steps: [
      { id: 'compose', title: 'Compose', instructions: 'Write it.', execution: { type: 'background-agent' } },
      { id: 'approve', title: 'Approve', instructions: 'Ask the user. Record variables.decision as "approved" or "rejected".', dependsOn: ['compose'], produces: ['decision'], gate: 'approval', execution: { type: 'background-agent' } },
      { id: 'send', title: 'Send', instructions: 'POST it.', dependsOn: ['approve'], when: { var: 'decision', in: ['approved'] }, execution: { type: 'background-agent' } },
      { id: 'finalize', title: 'Finalize', instructions: 'Confirm and complete.', dependsOn: ['send'], execution: { type: 'background-agent' } },
    ],
  });

  it('accepts gate: "approval" and rejects other values', () => {
    expect(validateLoopPlan(gatedPlan())).toEqual([]);
    const bad = gatedPlan();
    (bad.steps[1] as { gate: string }).gate = 'confirm';
    expect(validateLoopPlan(bad).join(' ')).toContain('gate');
  });

  it('requires an approval gate the final step depends on for external destinations', () => {
    expect(approvalGateProblems(gatedPlan(), { destination: 'webhook-post' })).toEqual([]);
    expect(approvalGateProblems(gatedPlan(), { destination: 'saved-artifact' })).toEqual([]);
    expect(approvalGateProblems(oneStepPlan().plan, { destination: 'chat-post' })[0]).toContain('gate');

    // In a single-sink plan every step is an ancestor of the sink, so a
    // "stranded" gate implies multiple sinks — a shape validateLoopPlan rejects
    // separately. There the check falls back to gate-exists:
    const multiSink = gatedPlan();
    multiSink.steps[3].dependsOn = ['compose']; // send + finalize both become sinks
    expect(approvalGateProblems(multiSink, { destination: 'webhook-post' })).toEqual([]);
  });

  it('rejects an external planner response without a gate so the repair pass can fix it', () => {
    const response = JSON.parse(planJson(oneStepPlan()));
    const result = validatePlanningResponse(response, { destination: 'email-send' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('gate');
    expect(validatePlanningResponse(response, { destination: 'workspace-files' }).ok).toBe(true);
  });

  it('blocks activation of an external loop whose plan lost its gate', () => {
    const host = createFakeHost();
    const loop = seedExternalLoop(host); // one-step plan, no gate
    const gate = planIsActivatable(loop);
    expect(gate.ok).toBe(false);
    expect(gate.error).toContain('gate');
  });

  it('instructs a gated step to ask via an approval question and never deliver', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, gatedPlan());
    const task = buildStepTask(loop, loop.plan.steps[1]);
    expect(task).toContain('APPROVAL GATE');
    expect(task).toContain('"kind": "approval"');
    expect(task).toContain('"id": "approve"');
    expect(buildStepTask(loop, loop.plan.steps[0])).not.toContain('APPROVAL GATE');
  });
});

describe('approval consumption (one approval, one send)', () => {
  it('sees an open approval only when approve was picked and nothing consumed it', () => {
    const base = { answeredInputs: [approvalAnswered()] } as unknown as Loop;
    expect(hasOpenApproval(base)).toBe(true);
    const rejected = { answeredInputs: [approvalAnswered({ answers: [{ questionId: 'q1', choiceId: 'reject' }] })] } as unknown as Loop;
    expect(hasOpenApproval(rejected)).toBe(false);
    const consumed = { answeredInputs: [approvalAnswered({ consumedAt: 't' })] } as unknown as Loop;
    expect(hasOpenApproval(consumed)).toBe(false);
  });

  it('consumeApprovals stamps open approvals and leaves the rest alone', () => {
    const inputs = [approvalAnswered(), approvalAnswered({ requestId: 'r2', answers: [{ questionId: 'q1', choiceId: 'reject' }] })];
    const consumed = consumeApprovals(inputs, 'NOW')!;
    expect(consumed[0].consumedAt).toBe('NOW');
    expect(consumed[1].consumedAt).toBeUndefined();
    expect(consumeApprovals(undefined, 'NOW')).toBeUndefined();
  });
});

describe('external receipt gate through the engine', () => {
  function engine(host: FakeHost, outcomes: Record<string, StepOutcome>): Coordinator {
    const deps: EngineDeps = { executor: fakeExecutor(outcomes), decider: fakeDecider({ decision: 'wait' }), locks: new LoopLocks() };
    return new Coordinator(host, deps);
  }

  it('refuses an external receipt with no approval on record', async () => {
    const host = createFakeHost();
    seedExternalLoop(host);
    await engine(host, { 'step-1': completing() }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const loop = host.state.loops[0];
    expect(loop.status).toBe('active'); // not complete — nothing may ship unapproved
    expect(loop.runtime.stepStates['step-1'].status).toBe('needs-revision');
    expect(loop.runtime.stepStates['step-1'].outcome?.summary).toContain('approval');
  });

  it('accepts the receipt once an approval is on record, then consumes it', async () => {
    const host = createFakeHost();
    const loop = seedExternalLoop(host);
    loop.answeredInputs = [approvalAnswered()];
    host.state = { ...host.state, loops: [loop] };
    await engine(host, { 'step-1': completing() }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const done = host.state.loops[0];
    expect(done.status).toBe('complete');
    expect(done.runtime.deliveries).toEqual([WEBHOOK_RECEIPT]);
    expect(done.answeredInputs?.[0].consumedAt).toBeDefined();
  });

  it('a rejected approval never authorizes a send', async () => {
    const host = createFakeHost();
    const loop = seedExternalLoop(host);
    loop.answeredInputs = [approvalAnswered({ answers: [{ questionId: 'q1', choiceId: 'reject' }] })];
    host.state = { ...host.state, loops: [loop] };
    await engine(host, { 'step-1': completing() }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(host.state.loops[0].status).toBe('active');
    expect(host.state.loops[0].runtime.deliveries ?? []).toHaveLength(0);
  });

  it('a consumed approval cannot cover a second send (fresh approval required each time)', async () => {
    const host = createFakeHost();
    const loop = seedExternalLoop(host);
    loop.answeredInputs = [approvalAnswered({ consumedAt: 'earlier' })];
    host.state = { ...host.state, loops: [loop] };
    await engine(host, { 'step-1': completing() }).requestAction({ kind: 'run_next', loopId: 'loop-1' });
    expect(host.state.loops[0].status).toBe('active');
  });

  it('stamps the asking run id through park → answer', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const asking: StepOutcome = {
      status: 'needs-revision', summary: 'awaiting approval',
      questions: [{ id: 'q1', prompt: 'Send this?', kind: 'approval', attachment: 'draft', choices: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }] }],
    };
    const coordinator = engine(host, { 'step-1': asking });
    await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    const parked = host.state.loops[0];
    const askingRunId = parked.runs[0].id;
    expect(parked.runtime.pendingInput?.runId).toBe(askingRunId);

    await coordinator.requestAction({
      kind: 'answer_input', loopId: 'loop-1', requestId: parked.runtime.pendingInput!.id,
      answers: [{ questionId: 'q1', choiceId: 'approve' }],
    });
    const answered = host.state.loops[0];
    expect(answered.answeredInputs?.[0].runId).toBe(askingRunId);
    // Finding recorded in the plan: the resume opens a NEW run (the parked one
    // ended as `waiting`), which is why the gate uses open-approval consumption
    // rather than same-run matching.
    expect(answered.runs.length).toBeGreaterThan(1);
    expect(answered.runs[answered.runs.length - 1].id).not.toBe(askingRunId);
  });
});
