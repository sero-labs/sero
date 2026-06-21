// P-A — LLM-authored verification: plan data model + planner + create flow
// (spec 05). The planner is a deterministic seam here (no live model): a loop is
// created `draft`, the injected planner derives the plan, and the loop flips to
// `active`. Exit-zero criteria are evaluated end-to-end; judge/threshold are
// `skipped` placeholders until P-B/P-C.

import { describe, expect, it } from 'vitest';

import { createHarness, settle, type WorkerScript } from './harness';
import { goalHash, parsePlannerOutput } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { PlannerRunner } from '@plugins/sero-orchestrator-plugin/runtime/planner';
import type { SuccessCriterion } from '@plugins/sero-orchestrator-plugin/shared/types';

function exitZero(command: string, required = true): SuccessCriterion {
  return {
    id: 'works',
    description: 'it works',
    evidence: [{ kind: 'run', command }],
    decision: { kind: 'exit-zero' },
    required,
  };
}

/** A deterministic planner that derives a plan from the loop's goal text. */
function goalPlanner(extra?: { calls?: { n: number }; usage?: { totalTokens: number } }): PlannerRunner {
  return async (loop) => {
    if (extra?.calls) extra.calls.n += 1;
    return {
      criteria: [
        {
          id: 'goal',
          description: `done: ${loop.goal}`,
          evidence: [{ kind: 'run', command: 'node test.js' }],
          decision: { kind: 'exit-zero' },
          required: true,
        },
      ],
      stopConditions: [],
      model: 'planner-model',
      usage: extra?.usage
        ? { inputTokens: 0, outputTokens: 0, totalTokens: extra.usage.totalTokens }
        : undefined,
    };
  };
}

const changeWorker: WorkerScript = () => ({
  response: '```json\n{"summary":"made a change","outcome":"changes-made"}\n```',
  changedFiles: ['sum.js'],
  diff: 'diff --git a/sum.js b/sum.js',
});

describe('P-A — verification plan: create → draft → derive → active', () => {
  it('creates a loop draft, then the planner flips it to active with a plan', async () => {
    const h = createHarness({ planner: goalPlanner() });
    const id = await h.createLoop({ goal: 'make the build pass' });

    // Before the planner settles, the loop is a draft.
    expect((await h.loop(id))!.status).toBe('draft');

    await settle();
    const loop = await h.loop(id);
    expect(loop!.status).toBe('active');
    expect(loop!.verificationPlan).toBeDefined();
    expect(loop!.verificationPlan!.criteria).toHaveLength(1);
    expect(loop!.verificationPlan!.criteria[0]!.description).toBe('done: make the build pass');
    expect(loop!.verificationPlan!.derivedFrom.goalHash).toBe(goalHash('make the build pass'));
    expect(loop!.verificationPlan!.derivedFrom.model).toBe('planner-model');
    h.cleanup();
  });

  it('leaves the loop in draft with a reason when derivation fails', async () => {
    const failingPlanner: PlannerRunner = async () => null;
    const h = createHarness({ planner: failingPlanner });
    const id = await h.createLoop();
    await settle();

    const loop = await h.loop(id);
    expect(loop!.status).toBe('draft');
    expect(loop!.verificationPlan).toBeUndefined();
    expect(loop!.statusReason).toMatch(/could not derive/i);
    expect(h.notifications.some((n) => n.type === 'warning')).toBe(true);
    h.cleanup();
  });

  it('a draft loop is not runnable (still deriving)', async () => {
    // A planner that never resolves keeps the loop in draft.
    const pending: PlannerRunner = () => new Promise(() => {});
    const h = createHarness({ planner: pending, runWorker: changeWorker });
    const id = await h.createLoop();
    await settle();
    expect((await h.loop(id))!.status).toBe('draft');

    const res = await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/deriving its verification plan/i);
    expect((await h.loop(id))!.attempts).toHaveLength(0);
    h.cleanup();
  });

  it('re-derives when the goal text changes (new provenance)', async () => {
    const calls = { n: 0 };
    const h = createHarness({ planner: goalPlanner({ calls }) });
    const id = await h.createLoop({ goal: 'first goal' });
    await settle();
    expect(calls.n).toBe(1);
    expect((await h.loop(id))!.verificationPlan!.criteria[0]!.description).toBe('done: first goal');

    await h.patchLoop(id, (loop) => {
      loop.goal = 'second goal';
    });
    await h.coordinator.ensurePlan(id);
    const loop = await h.loop(id);
    expect(calls.n).toBe(2);
    expect(loop!.verificationPlan!.criteria[0]!.description).toBe('done: second goal');
    expect(loop!.verificationPlan!.derivedFrom.goalHash).toBe(goalHash('second goal'));
    h.cleanup();
  });

  it('does not re-derive when the plan is already up to date', async () => {
    const calls = { n: 0 };
    const h = createHarness({ planner: goalPlanner({ calls }) });
    const id = await h.createLoop();
    await settle();
    expect(calls.n).toBe(1);

    await h.coordinator.ensurePlan(id);
    expect(calls.n).toBe(1); // goal unchanged → no second derivation
    h.cleanup();
  });

  it('legacy path: with planning disabled a loop is created active with no plan', async () => {
    const h = createHarness(); // no planner → disabled
    const id = await h.createLoop();
    const loop = await h.loop(id);
    expect(loop!.status).toBe('active');
    expect(loop!.verificationPlan).toBeUndefined();
    h.cleanup();
  });
});

describe('P-A — criterion evaluation', () => {
  it('completes when a required exit-zero criterion passes', async () => {
    const h = createHarness({
      planner: goalPlanner(),
      runWorker: changeWorker,
      verify: (command) => ({ command, success: true, stdout: 'ok', stderr: '', durationMs: 3 }),
    });
    const id = await h.createLoop();
    await settle();

    const res = await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect(res.ok).toBe(true);
    const loop = await h.loop(id);
    expect(loop!.status).toBe('complete');
    const attempt = loop!.attempts.at(-1)!;
    expect(attempt.checkResults).toHaveLength(1);
    expect(attempt.checkResults[0]!.type).toBe('criterion');
    expect(attempt.checkResults[0]!.decisionKind).toBe('exit-zero');
    expect(attempt.checkResults[0]!.status).toBe('passed');
    h.cleanup();
  });

  it('does not complete when a required exit-zero criterion fails', async () => {
    const h = createHarness({
      planner: goalPlanner(),
      runWorker: changeWorker,
      verify: (command) => ({ command, success: false, stdout: '', stderr: 'boom', durationMs: 3 }),
    });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).toBe('stopped'); // maxAttempts: 1, criterion failed
    expect(loop!.attempts.at(-1)!.checkResults[0]!.status).toBe('failed');
    h.cleanup();
  });

  it('a required threshold criterion is skipped (P-C placeholder) so the loop does not complete', async () => {
    const thresholdPlanner: PlannerRunner = async () => ({
      criteria: [
        {
          id: 'fast',
          description: 'fast enough',
          evidence: [{ kind: 'run', command: 'measure' }],
          decision: { kind: 'threshold', metric: 'ms', op: '<', value: 50 },
          required: true,
        },
      ],
      stopConditions: [],
    });
    const h = createHarness({ planner: thresholdPlanner, runWorker: changeWorker });
    const id = await h.createLoop({ stopRule: { maxAttempts: 1 } });
    await settle();

    await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    const loop = await h.loop(id);
    expect(loop!.status).not.toBe('complete');
    const result = loop!.attempts.at(-1)!.checkResults[0]!;
    expect(result.status).toBe('skipped');
    expect(result.decisionKind).toBe('threshold');
    h.cleanup();
  });

  it('folds planner spend into the cumulative token budget', async () => {
    const h = createHarness({
      planner: goalPlanner({ usage: { totalTokens: 500 } }),
      runWorker: changeWorker,
    });
    const id = await h.createLoop({ budget: { maxTotalTokens: 100 } });
    await settle();

    const res = await h.coordinator.requestAction({ kind: 'run_next', loopId: id });
    expect(res.ok).toBe(true);
    const loop = await h.loop(id);
    expect(loop!.status).toBe('blocked');
    expect(loop!.blockedReason).toBe('budget-exhausted');
    expect(loop!.attempts).toHaveLength(0); // blocked before any attempt
    h.cleanup();
  });
});

describe('P-A — parsePlannerOutput (defensive)', () => {
  function fenced(obj: unknown): string {
    return `Here is the plan.\n\`\`\`json\n${JSON.stringify(obj)}\n\`\`\``;
  }

  it('parses a well-formed plan with mixed decisions', () => {
    const parsed = parsePlannerOutput(
      fenced({
        criteria: [
          { id: 'build', description: 'build passes', evidence: [{ kind: 'run', command: 'pnpm build' }], decision: { kind: 'exit-zero' }, required: true },
          { id: 'fast', description: 'fast', evidence: [{ kind: 'run', command: 'measure' }], decision: { kind: 'threshold', metric: 'ms', op: '<', value: 50, aggregate: { kind: 'all' } } },
          { id: 'dead', description: 'truly dead', evidence: [{ kind: 'diff' }], decision: { kind: 'judge', rubric: 'is it dead' }, required: false },
        ],
        stopConditions: [{ kind: 'approval-required', reason: 'deletes code' }],
      }),
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.criteria).toHaveLength(3);
    expect(parsed!.criteria[1]!.decision).toMatchObject({ kind: 'threshold', op: '<', value: 50 });
    expect(parsed!.criteria[2]!.required).toBe(false);
    expect(parsed!.stopConditions[0]).toMatchObject({ kind: 'approval-required' });
  });

  it('drops malformed criteria and returns null when none remain', () => {
    expect(
      parsePlannerOutput(fenced({ criteria: [{ description: 'no decision' }, { decision: { kind: 'exit-zero' } }] })),
    ).toBeNull();
  });

  it('drops a criterion with an unknown decision kind but keeps valid ones', () => {
    const parsed = parsePlannerOutput(
      fenced({
        criteria: [
          { description: 'bad', evidence: [], decision: { kind: 'magic' } },
          { description: 'good', evidence: [{ kind: 'run', command: 'x' }], decision: { kind: 'exit-zero' } },
        ],
      }),
    );
    expect(parsed!.criteria).toHaveLength(1);
    expect(parsed!.criteria[0]!.description).toBe('good');
    expect(parsed!.criteria[0]!.required).toBe(true); // defaults to required
  });

  it('returns null when there is no fenced JSON block', () => {
    expect(parsePlannerOutput('I could not find a way to verify this.')).toBeNull();
  });
});
