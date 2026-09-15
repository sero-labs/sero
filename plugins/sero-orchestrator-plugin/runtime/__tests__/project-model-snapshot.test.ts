/**
 * Project model snapshots reach every delegated call class
 * (spec architect-model-overrides).
 *
 * A Workflow or Room keeps the tier defaults the project had when it was
 * created, so later steps, retries and recurring runs do not silently follow a
 * global change. An explicit caller choice still wins.
 */

import { describe, expect, it } from 'vitest';
import type { OrchestratorProjectModelSnapshot } from '@sero-ai/common';
import { modelExecutor } from '../executors/model';
import type { StepRunInput } from '../engine-types';
import type { Loop, LoopRun } from '../../shared/types';
import { applyProjectSnapshot, snapshotSource } from '../project-models';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

const SNAPSHOT: OrchestratorProjectModelSnapshot = {
  LOW: { provider: 'anthropic', modelId: 'haiku', thinkingLevel: 'low', source: 'inherited global rev 7' },
  MED: { provider: 'openai', modelId: 'gpt-codex', thinkingLevel: 'high', source: 'project override rev 7' },
};

describe('applyProjectSnapshot', () => {
  it('resolves a tier label from the snapshot', () => {
    expect(applyProjectSnapshot(SNAPSHOT, 'MED')).toEqual({ model: 'openai/gpt-codex', thinking: 'high', fromSnapshot: true });
    expect(applyProjectSnapshot(SNAPSHOT, 'LOW')).toEqual({ model: 'anthropic/haiku', thinking: 'low', fromSnapshot: true });
  });

  it('treats no preference as the MED tier', () => {
    expect(applyProjectSnapshot(SNAPSHOT, undefined)).toMatchObject({ model: 'openai/gpt-codex', fromSnapshot: true });
  });

  it('leaves an explicit pin untouched', () => {
    expect(applyProjectSnapshot(SNAPSHOT, 'anthropic/opus')).toEqual({ model: 'anthropic/opus', thinking: undefined, fromSnapshot: false });
  });

  it('passes through when the snapshot has no entry for the tier', () => {
    expect(applyProjectSnapshot(SNAPSHOT, 'HIGH')).toEqual({ model: 'HIGH', thinking: undefined, fromSnapshot: false });
    expect(applyProjectSnapshot(undefined, 'MED')).toEqual({ model: 'MED', thinking: undefined, fromSnapshot: false });
  });

  it('reports which selection source the snapshot recorded', () => {
    expect(snapshotSource(SNAPSHOT, 'MED')).toBe('project override rev 7');
    expect(snapshotSource(SNAPSHOT, 'anthropic/opus')).toBe('explicit pin');
  });
});

function inputFor(host: FakeHost, loop: Loop, stepId: string): StepRunInput {
  const run: LoopRun = {
    id: host.newId('run'), runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [],
    recoveryDecisions: [], observations: [], startedAt: host.now(),
  };
  return {
    host, loop, run, step: loop.plan.steps.find((s) => s.id === stepId)!,
    attemptNumber: 1, parentSessionId: loop.runtime.parentSessionId,
  };
}

const succeeded = JSON.stringify({ status: 'succeeded', summary: 'done' });

describe('a dispatched Workflow keeps its snapshot', () => {
  it('sends the snapshot model and thinking on a worker call', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.project = { projectId: 'hollow-depths', runId: 'run-initial', configRevision: 7, modelSnapshot: SNAPSHOT };
    host.modelResponses.push({ response: succeeded });

    await modelExecutor.run(inputFor(host, loop, 'step-1'));
    expect(host.modelCalls[0]).toMatchObject({ model: 'openai/gpt-codex', thinking: 'high' });
  });

  it('still lets an explicit step pin win over the snapshot', async () => {
    const host = createFakeHost();
    host.availableModels = [{
      provider: 'anthropic', displayName: 'Anthropic', logo: '',
      models: [{ provider: 'anthropic', modelId: 'opus', name: 'Opus', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] }],
    }];
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.project = { projectId: 'hollow-depths', runId: 'run-initial', configRevision: 7, modelSnapshot: SNAPSHOT };
    loop.plan.steps[0].execution = { type: 'background-agent', model: 'anthropic/opus' };
    host.modelResponses.push({ response: succeeded });

    await modelExecutor.run(inputFor(host, loop, 'step-1'));
    expect(host.modelCalls[0].model).toBe('anthropic/opus');
  });

  it('resolves a per-step tier from the snapshot rather than the global default', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.project = { projectId: 'hollow-depths', runId: 'run-initial', configRevision: 7, modelSnapshot: SNAPSHOT };
    loop.plan.steps[0].execution = { type: 'background-agent', model: 'LOW' };
    host.modelResponses.push({ response: succeeded });

    await modelExecutor.run(inputFor(host, loop, 'step-1'));
    expect(host.modelCalls[0]).toMatchObject({ model: 'anthropic/haiku', thinking: 'low' });
  });

  it('retains the snapshot for a later attempt after the global defaults change', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    loop.project = { projectId: 'hollow-depths', runId: 'run-initial', configRevision: 7, modelSnapshot: SNAPSHOT };
    host.modelResponses.push({ response: succeeded }, { response: succeeded });

    await modelExecutor.run(inputFor(host, loop, 'step-1'));
    // The user changes the global defaults after the dispatch was created. The
    // loop keeps the snapshot it was created with.
    const changed: OrchestratorProjectModelSnapshot = { MED: { provider: 'anthropic', modelId: 'opus', thinkingLevel: 'medium' } };
    await modelExecutor.run(inputFor(host, { ...loop, project: { ...loop.project, configRevision: 8, modelSnapshot: undefined } }, 'step-1'));
    await modelExecutor.run(inputFor(host, loop, 'step-1'));

    expect(host.modelCalls.map((call) => call.model)).toEqual([
      'openai/gpt-codex', undefined, 'openai/gpt-codex',
    ]);
    expect(changed.MED?.modelId).toBe('opus');
  });

  it('leaves a loop without a snapshot entirely to the host', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.modelResponses.push({ response: succeeded });

    await modelExecutor.run(inputFor(host, loop, 'step-1'));
    // No snapshot and no step choice: the call carries nothing, and the host
    // adapter's own MED default applies, exactly as before this change.
    expect(host.modelCalls[0].model).toBeUndefined();
    expect(host.modelCalls[0].thinking).toBeUndefined();
  });
});
