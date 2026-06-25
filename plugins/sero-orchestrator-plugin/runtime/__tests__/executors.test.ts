import { describe, expect, it } from 'vitest';
import { backgroundAgentExecutor } from '../executors/background-agent';
import { modelExecutor } from '../executors/model';
import { buildStepTask, parseStepOutcome, parseStepOutcomeStrict } from '../executors/prompt';
import type { StepRunInput } from '../engine-types';
import type { Loop, LoopPlan, LoopRun, ResolvedWorkspaceContext, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, sequentialPlan, seedActiveLoop } from './fixtures';

function emptyRun(host: FakeHost): LoopRun {
  return { id: host.newId('run'), runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: host.now() };
}

function inputFor(host: FakeHost, loop: Loop, stepId: string, workspace?: ResolvedWorkspaceContext): StepRunInput {
  return {
    host,
    loop,
    run: emptyRun(host),
    step: loop.plan.steps.find((s) => s.id === stepId)!,
    attemptNumber: 1,
    parentSessionId: loop.runtime.parentSessionId,
    workspace,
  };
}

const outcome = (o: StepOutcome) => JSON.stringify(o);

describe('parseStepOutcome', () => {
  it('parses the exact shape', () => {
    expect(parseStepOutcome('```json\n{"status":"succeeded","summary":"done"}\n```')?.status).toBe('succeeded');
  });
  it('rejects near-miss status words instead of guessing', () => {
    // The live failure: a background agent reported "completed" (not an allowed value).
    expect(parseStepOutcome('{"status":"completed","summary":"x"}')).toBeUndefined();
    expect(parseStepOutcome('{"status":"success","summary":"x"}')).toBeUndefined();
    expect(parseStepOutcome('{"outcome":"succeeded","summary":"x"}')).toBeUndefined();
  });
  it('returns undefined when there is no usable status', () => {
    expect(parseStepOutcome('I finished the work.')).toBeUndefined();
  });
});

describe('parseStepOutcomeStrict', () => {
  it('reports the exact reason a near-miss status is rejected', () => {
    const result = parseStepOutcomeStrict({ status: 'completed', summary: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('succeeded, failed, blocked, skipped, needs-revision');
      expect(result.errors[0]).toContain('"completed"');
    }
  });
  it('rejects a malformed completion block', () => {
    const result = parseStepOutcomeStrict({ status: 'succeeded', summary: 'x', completion: { status: 'done' } });
    expect(result.ok).toBe(false);
  });
  it('accepts the exact shape with completion', () => {
    const result = parseStepOutcomeStrict({ status: 'succeeded', summary: 'x', completion: { status: 'complete', reason: 'done' } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.completion?.status).toBe('complete');
  });
});

describe('buildStepTask finalization signal', () => {
  it('tells the single sink step to emit the completion signal', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const task = buildStepTask(loop, loop.plan.steps[0]);
    expect(task).toContain('FINAL step');
    expect(task).toContain('"completion"');
  });

  it('asks only the sink step (not its dependencies) to complete the loop', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan); // a -> b; b is the sink
    const stepA = loop.plan.steps.find((s) => s.id === 'a')!;
    const stepB = loop.plan.steps.find((s) => s.id === 'b')!;
    expect(buildStepTask(loop, stepA)).not.toContain('FINAL step');
    expect(buildStepTask(loop, stepB)).toContain('FINAL step');
  });

  it('forces completion on no step when the graph has multiple leaves', () => {
    const host = createFakeHost();
    const plan: LoopPlan = {
      schemaVersion: 1, revision: 0, objective: 'o',
      steps: [
        { id: 'a', title: 'A', instructions: 'do a', execution: { type: 'background-agent' } },
        { id: 'b', title: 'B', instructions: 'do b', execution: { type: 'background-agent' } },
      ],
    };
    const loop = seedActiveLoop(host, plan);
    expect(buildStepTask(loop, loop.plan.steps[0])).not.toContain('FINAL step');
    expect(buildStepTask(loop, loop.plan.steps[1])).not.toContain('FINAL step');
  });
});

describe('backgroundAgentExecutor', () => {
  it('runs with the resolved cwd and full tool surface and records the outcome', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const workspace: ResolvedWorkspaceContext = {
      id: 'w', type: 'managed-worktree', workspaceRoot: '/root', cwd: '/root/.sero/worktrees/loop-1', resolvedBy: 'create-option', createdAt: 't',
    };
    host.modelResponses.push({
      response: `Did the work.\n${outcome({ status: 'succeeded', summary: 'done' })}`,
      modelId: 'claude-x', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, durationMs: 42,
    });
    const attempt = await backgroundAgentExecutor.run(inputFor(host, loop, 'step-1', workspace));

    expect(host.modelCalls[0].cwd).toBe(workspace.cwd);
    expect(host.modelCalls[0].platformTools).toBe('all');
    expect(attempt.status).toBe('completed');
    expect(attempt.outcome?.status).toBe('succeeded');
    expect(attempt.model).toBe('claude-x');
    expect(attempt.usage?.totalTokens).toBe(15);
    expect(attempt.workspace).toEqual(workspace);
  });

  it('marks the attempt failed when the run reports an error', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: '', error: 'agent crashed' });
    const attempt = await backgroundAgentExecutor.run(inputFor(host, loop, 'step-1'));
    expect(attempt.status).toBe('failed');
    expect(attempt.error).toBe('agent crashed');
  });
});

describe('modelExecutor', () => {
  it('runs as a pure model call (no platform tools)', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: outcome({ status: 'succeeded', summary: 'ok' }) });
    await modelExecutor.run(inputFor(host, loop, 'step-1'));
    expect(host.modelCalls[0].platformTools).toBe('none');
  });

  it('includes the outputSchema in the prompt and validates the JSON', async () => {
    const host = createFakeHost();
    const plan = oneStepPlan().plan;
    plan.steps[0].execution = { type: 'model', outputSchema: { type: 'object', properties: { score: { type: 'number' } } } };
    const loop = seedActiveLoop(host, plan);
    host.modelResponses.push({ response: outcome({ status: 'succeeded', summary: 'scored', variables: { score: 7 } }) });
    const attempt = await modelExecutor.run(inputFor(host, loop, 'step-1'));
    expect(host.modelCalls[0].task).toContain('schema');
    expect(host.modelCalls[0].task).toContain('"score"');
    expect(attempt.outcome?.status).toBe('succeeded');
    expect(attempt.outcome?.variables).toMatchObject({ score: 7 });
  });

  it('fails a schema step that returns no JSON object', async () => {
    const host = createFakeHost();
    const plan = oneStepPlan().plan;
    plan.steps[0].execution = { type: 'model', outputSchema: { type: 'object' } };
    const loop = seedActiveLoop(host, plan);
    host.modelResponses.push({ response: 'no json here at all' });
    const attempt = await modelExecutor.run(inputFor(host, loop, 'step-1'));
    expect(attempt.outcome?.status).toBe('failed');
  });
});
