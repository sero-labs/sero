import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { applyStepTools } from '../plan-mapping';
import type { Loop, StepExecutionTarget } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

function toolsOf(host: FakeHost, stepId: string): string[] | undefined {
  const exec = host.state.loops[0].plan.steps.find((s) => s.id === stepId)?.execution;
  return exec && exec.type === 'background-agent' ? exec.tools : undefined;
}

describe('set_step_tools action', () => {
  it('sets a tool allowlist and reverts to the lean baseline', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const coordinator = new Coordinator(host);

    await coordinator.requestAction({ kind: 'set_step_tools', loopId: 'loop-1', stepId: 'step-1', tools: ['bash', 'read', 'web_search'] });
    expect(toolsOf(host, 'step-1')).toEqual(['bash', 'read', 'web_search']);

    // No tools (or empty) → revert to the lean baseline (undefined on the step).
    await coordinator.requestAction({ kind: 'set_step_tools', loopId: 'loop-1', stepId: 'step-1' });
    expect(toolsOf(host, 'step-1')).toBeUndefined();
  });

  it('rejects an unknown step', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const res = await new Coordinator(host).requestAction({ kind: 'set_step_tools', loopId: 'loop-1', stepId: 'nope', tools: ['bash'] });
    expect(res.ok).toBe(false);
  });
});

describe('applyStepTools', () => {
  it('refuses a model step (it has no tools)', () => {
    const loop = { plan: { steps: [{ id: 's', title: 'S', instructions: 'x', execution: { type: 'model' } as StepExecutionTarget }] } } as Loop;
    const result = applyStepTools(loop, 's', ['bash'], 't');
    expect(result.ok).toBe(false);
  });

  it('trims names and treats an all-empty list as a revert to baseline', () => {
    const loop = { plan: { steps: [{ id: 's', title: 'S', instructions: 'x', execution: { type: 'background-agent' } as StepExecutionTarget }] }, updatedAt: '' } as Loop;
    const set = applyStepTools(loop, 's', [' bash ', 'read', ''], 't1');
    const setExec = set.loop?.plan.steps[0].execution;
    expect(setExec && setExec.type === 'background-agent' ? setExec.tools : null).toEqual(['bash', 'read']);

    const cleared = applyStepTools(set.loop as Loop, 's', ['  ', ''], 't2');
    const clearedExec = cleared.loop?.plan.steps[0].execution;
    expect(clearedExec && clearedExec.type === 'background-agent' ? clearedExec.tools : 'x').toBeUndefined();
  });
});
