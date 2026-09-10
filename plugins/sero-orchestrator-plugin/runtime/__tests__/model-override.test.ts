import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import { applyStepModel } from '../plan-mapping';
import type { Loop, LoopPlan, StepExecutionTarget, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const ok = (): string => JSON.stringify({ status: 'succeeded', summary: 'ok' } satisfies StepOutcome);

const MODELS = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: '',
    models: [{ provider: 'anthropic', modelId: 'claude-x', name: 'Claude X', reasoning: true }],
  },
];

function modelOf(host: FakeHost, stepId: string): string | undefined {
  const exec = host.state.loops[0].plan.steps.find((s) => s.id === stepId)?.execution;
  return exec && 'model' in exec ? exec.model : undefined;
}

describe('set_step_model action', () => {
  it('sets a tier, pins a specific model, and reverts to default', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const coordinator = new Coordinator(host);

    await coordinator.requestAction({ kind: 'set_step_model', loopId: 'loop-1', stepId: 'step-1', model: 'HIGH' });
    expect(modelOf(host, 'step-1')).toBe('HIGH');

    await coordinator.requestAction({ kind: 'set_step_model', loopId: 'loop-1', stepId: 'step-1', model: 'anthropic/claude-x' });
    expect(modelOf(host, 'step-1')).toBe('anthropic/claude-x');

    // No model → revert to the orchestrator default.
    await coordinator.requestAction({ kind: 'set_step_model', loopId: 'loop-1', stepId: 'step-1' });
    expect(modelOf(host, 'step-1')).toBeUndefined();
  });

  it('rejects an unknown step', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).requestAction({ kind: 'set_step_model', loopId: 'loop-1', stepId: 'nope', model: 'LOW' });
    expect(res.ok).toBe(false);
  });
});

describe('applyStepModel', () => {
  it('refuses an active-session step (it has no model)', () => {
    const loop = { plan: { steps: [{ id: 's', title: 'S', instructions: 'x', execution: { type: 'active-session' } as StepExecutionTarget }] } } as Loop;
    const result = applyStepModel(loop, 's', 'HIGH', undefined, 't');
    expect(result.ok).toBe(false);
  });
});

describe('engine unavailable pinned model', () => {
  function pinnedUnavailablePlan(): LoopPlan {
    const plan = oneStepPlan().plan;
    plan.steps[0].execution = { type: 'background-agent', model: 'openai/gpt-9' };
    return plan;
  }

  it('blocks with a truthful retained state without calling a model', async () => {
    const host = createFakeHost();
    host.availableModels = MODELS;
    seedActiveLoop(host, pinnedUnavailablePlan());
    const engine = new RunEngine(host, createEngineDeps(new LoopLocks()));

    await engine.run('loop-1');
    expect(host.modelCalls).toHaveLength(0);
    expect(host.state.loops[0]).toMatchObject({
      status: 'blocked',
      runtime: { block: { kind: 'runtime-error', reason: expect.stringContaining('Restore that model/provider') } },
      runs: [{ status: 'blocked' }],
    });
    expect(host.state.loops[0].runtime.stepStates['step-1']).toMatchObject({
      status: 'blocked',
      outcome: { status: 'blocked', summary: expect.stringContaining('No worker was started') },
    });
  });
});
