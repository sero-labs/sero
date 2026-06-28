import { describe, expect, it } from 'vitest';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { Coordinator } from '../coordinator';
import type { EngineDeps } from '../engine-types';
import type { PendingInput, StepOutcome } from '../../shared/types';
import {
  formatAnswerNote,
  parseHumanQuestions,
  parkForInput,
  recordAnswer,
  validateAnswers,
} from '../human-input';
import { applyAnswerInput } from '../input-actions';
import { createFakeHost, type FakeHost } from './fake-host';
import { fakeDecider, fakeExecutor } from './engine-fakes';
import { oneStepPlan, planJson, sequentialPlan, seedActiveLoop } from './fixtures';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'done' };

function deps(partial: Partial<EngineDeps>): EngineDeps {
  return {
    executor: partial.executor ?? fakeExecutor({}),
    decider: partial.decider ?? fakeDecider({ decision: 'wait' }),
    locks: partial.locks ?? new LoopLocks(),
    evaluator: partial.evaluator,
    workspaceResolver: partial.workspaceResolver,
  };
}

function loopOf(host: FakeHost, id = 'loop-1') {
  return host.state.loops.find((l) => l.id === id)!;
}

// ── parsing ─────────────────────────────────────────────────

describe('parseHumanQuestions', () => {
  it('parses prompts and object/string choices, assigning positional ids', () => {
    const questions = parseHumanQuestions([
      { prompt: 'Drop the table?', choices: ['Drop it', { id: 'keep', label: 'Keep it' }] },
      { prompt: 'Anything else?' },
    ]);
    expect(questions).not.toBeNull();
    expect(questions).toHaveLength(2);
    expect(questions![0].id).toBe('q1');
    expect(questions![0].choices).toEqual([
      { id: 'c1', label: 'Drop it' },
      { id: 'keep', label: 'Keep it' },
    ]);
    expect(questions![1].id).toBe('q2');
    expect(questions![1].choices).toBeUndefined();
  });

  it('returns null for empty, non-array, or content-free input', () => {
    expect(parseHumanQuestions([])).toBeNull();
    expect(parseHumanQuestions(undefined)).toBeNull();
    expect(parseHumanQuestions([{ notAPrompt: 1 }, '   '])).toBeNull();
  });
});

// ── validation ──────────────────────────────────────────────

const pending: PendingInput = {
  id: 'input_1',
  source: 'step',
  stepId: 'a',
  askedAt: 't',
  questions: [{ id: 'q1', prompt: 'Pick one', choices: [{ id: 'c1', label: 'Yes' }, { id: 'c2', label: 'No' }] }],
};

describe('validateAnswers', () => {
  it('accepts a picked choice or free text', () => {
    expect(validateAnswers(pending, [{ questionId: 'q1', choiceId: 'c1' }])).toBeNull();
    expect(validateAnswers(pending, [{ questionId: 'q1', text: 'maybe' }])).toBeNull();
  });

  it('rejects an unanswered question, an invalid choice, and an unknown question', () => {
    expect(validateAnswers(pending, [])).toContain('was not answered');
    expect(validateAnswers(pending, [{ questionId: 'q1', choiceId: 'nope' }])).toContain('not one of the offered choices');
    expect(validateAnswers(pending, [{ questionId: 'q1', text: 'x' }, { questionId: 'qX', text: 'y' }])).toContain('unknown question');
  });
});

// ── recording answers ───────────────────────────────────────

describe('recordAnswer', () => {
  it('for a step question: clears pendingInput, notes the answer, and resets the asking step', () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan);
    let loop = loopOf(host);
    loop = { ...loop, runtime: { ...loop.runtime, pendingInput: pending } };

    const { loop: next, source } = recordAnswer(loop, pending, [{ questionId: 'q1', choiceId: 'c1' }], 'now');
    expect(source).toBe('step');
    expect(next.runtime.pendingInput).toBeUndefined();
    expect(next.answeredInputs).toHaveLength(1);
    expect(String(next.runtime.variables.notes)).toContain('do not ask again');
    expect(String(next.runtime.variables.notes)).toContain('Yes');
    expect(next.runtime.stepStates.a.status).toBe('pending');
  });

  it('for a planner question: records the answer without touching steps/variables', () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan);
    let loop = loopOf(host);
    const plannerPending: PendingInput = { ...pending, source: 'planner', stepId: undefined };
    loop = { ...loop, runtime: { ...loop.runtime, pendingInput: plannerPending } };

    const { loop: next, source } = recordAnswer(loop, plannerPending, [{ questionId: 'q1', text: 'Postgres' }], 'now');
    expect(source).toBe('planner');
    expect(next.runtime.pendingInput).toBeUndefined();
    expect(next.answeredInputs).toHaveLength(1);
    expect(next.runtime.variables.notes).toBeUndefined();
  });

  it('formatAnswerNote renders the picked label and free text', () => {
    const answered = { requestId: 'r', source: 'step' as const, questions: pending.questions, answers: [{ questionId: 'q1', choiceId: 'c1', text: 'because' }], answeredAt: 't' };
    const note = formatAnswerNote(answered);
    expect(note).toContain('Pick one');
    expect(note).toContain('Yes — because');
  });
});

// ── engine parks on a step question ─────────────────────────

describe('RunEngine — step questions', () => {
  it('parks the loop on a step question and does not run downstream steps', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan); // a -> b
    const executor = fakeExecutor({
      a: { status: 'needs-revision', summary: 'need input', questions: [{ id: 'q1', prompt: 'Proceed?' }] },
      b: SUCCESS,
    });
    const result = await new RunEngine(host, deps({ executor })).run('loop-1');

    expect(result.acquired).toBe(true);
    expect(executor.calls).toEqual(['a']); // b never became ready
    const loop = loopOf(host);
    expect(loop.runtime.pendingInput?.source).toBe('step');
    expect(loop.runtime.pendingInput?.stepId).toBe('a');
    expect(loop.runtime.pendingInput?.questions).toHaveLength(1);
    expect(loop.runtime.stepStates.a.status).toBe('pending'); // reset for re-run
    expect(loop.runs[0].status).toBe('waiting');
    expect(host.notifications.some((n) => n.message.includes('waiting on you'))).toBe(true);
  });

  it('refuses to start a run while parked', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    let loop = loopOf(host);
    loop = { ...loop, runtime: { ...loop.runtime, pendingInput: { ...pending, stepId: 'step-1' } } };
    host.state = { ...host.state, loops: [loop] };
    const executor = fakeExecutor({ 'step-1': SUCCESS });
    await new RunEngine(host, deps({ executor })).run('loop-1');
    expect(executor.calls).toEqual([]); // nothing ran
  });
});

// ── applyAnswerInput resumes / re-plans ─────────────────────

describe('applyAnswerInput', () => {
  it('answers a step question and signals resume', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan);
    let loop = loopOf(host);
    loop = { ...loop, runtime: { ...loop.runtime, pendingInput: pending } };
    host.state = { ...host.state, loops: [loop] };

    const result = await applyAnswerInput(host, { kind: 'answer_input', loopId: 'loop-1', requestId: 'input_1', answers: [{ questionId: 'q1', choiceId: 'c1' }] });
    expect(result.ok).toBe(true);
    expect(result.resume).toBe(true);
    expect(result.loop?.runtime.pendingInput).toBeUndefined();
    expect(result.loop?.answeredInputs).toHaveLength(1);
  });

  it('rejects an answer whose requestId does not match the pending question', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, sequentialPlan().plan);
    let loop = loopOf(host);
    loop = { ...loop, runtime: { ...loop.runtime, pendingInput: pending } };
    host.state = { ...host.state, loops: [loop] };

    const result = await applyAnswerInput(host, { kind: 'answer_input', loopId: 'loop-1', requestId: 'wrong', answers: [{ questionId: 'q1', choiceId: 'c1' }] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No matching question');
  });

  it('answers a planner question and re-runs the planner into a plan', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    let loop = { ...loopOf(host), status: 'draft' as const };
    const plannerPending: PendingInput = { ...pending, source: 'planner', stepId: undefined };
    loop = { ...loop, runtime: { ...loop.runtime, pendingInput: plannerPending } };
    host.state = { ...host.state, loops: [loop] };
    host.modelResponses.push({ response: planJson(oneStepPlan()) }); // the re-plan

    const result = await applyAnswerInput(host, { kind: 'answer_input', loopId: 'loop-1', requestId: 'input_1', answers: [{ questionId: 'q1', text: 'Postgres' }] });
    expect(result.ok).toBe(true);
    expect(result.resume).toBe(false);
    expect(result.loop?.runtime.pendingInput).toBeUndefined();
    expect(result.loop?.plan.steps).toHaveLength(1);
    expect(result.loop?.answeredInputs).toHaveLength(1);
  });
});

// ── coordinator: planner clarifications end-to-end ──────────

describe('Coordinator — planner clarifications', () => {
  it('create parks on planner questions, then answer builds the plan', async () => {
    const host = createFakeHost();
    const coordinator = new Coordinator(host);
    host.modelResponses.push({
      response: JSON.stringify({ clarifyingQuestions: [{ prompt: 'Which database?', choices: ['Postgres', 'MySQL'] }] }),
    });
    const created = await coordinator.requestAction({ kind: 'create', prompt: 'migrate the db', options: { activate: true } });
    expect(created.ok).toBe(true);
    const loop = created.loop!;
    expect(loop.status).toBe('draft'); // not activated — parked on a question
    expect(loop.runtime.pendingInput?.source).toBe('planner');
    const requestId = loop.runtime.pendingInput!.id;

    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const answered = await coordinator.requestAction({
      kind: 'answer_input',
      loopId: loop.id,
      requestId,
      answers: [{ questionId: loop.runtime.pendingInput!.questions[0].id, choiceId: 'c1' }],
    });
    expect(answered.ok).toBe(true);
    expect(answered.loop?.runtime.pendingInput).toBeUndefined();
    expect(answered.loop?.plan.steps).toHaveLength(1);
    expect(answered.loop?.answeredInputs).toHaveLength(1);
  });
});
