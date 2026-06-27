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
  it('stores only the extras (baseline names are implicit) and reverts to baseline', async () => {
    const host = createFakeHost();
    seedActiveLoop(host, oneStepPlan().plan);
    const coordinator = new Coordinator(host);

    // bash/read are baseline (always on) → stripped; only web_search is stored.
    await coordinator.requestAction({ kind: 'set_step_tools', loopId: 'loop-1', stepId: 'step-1', tools: ['bash', 'read', 'web_search'] });
    expect(toolsOf(host, 'step-1')).toEqual(['web_search']);

    // No tools (or only baseline) → revert to baseline only (undefined on the step).
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

  it('trims names, strips baseline, and clears when only baseline remains', () => {
    const loop = { plan: { steps: [{ id: 's', title: 'S', instructions: 'x', execution: { type: 'background-agent' } as StepExecutionTarget }] }, updatedAt: '' } as Loop;
    const set = applyStepTools(loop, 's', [' web_search ', 'bash', 'git_manager', ''], 't1');
    const setExec = set.loop?.plan.steps[0].execution;
    // bash (baseline) and the empty string are dropped; the extras are kept trimmed.
    expect(setExec && setExec.type === 'background-agent' ? setExec.tools : null).toEqual(['web_search', 'git_manager']);

    const cleared = applyStepTools(set.loop as Loop, 's', ['read', 'edit'], 't2');
    const clearedExec = cleared.loop?.plan.steps[0].execution;
    // Only baseline names → no extras → field cleared.
    expect(clearedExec && clearedExec.type === 'background-agent' ? clearedExec.tools : 'x').toBeUndefined();
  });
});
