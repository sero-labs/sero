import { describe, expect, it } from 'vitest';
import { applyReflection, approveSuggestion, changedStepIds, proposeImprovements, rejectSuggestion } from '../reflection';
import { buildRunDigest, readDigests } from '../digest';
import { handleReflectAction } from '../reflect-actions';
import { createFakeHost, type FakeHost } from './fake-host';
import { seedActiveLoop, sequentialPlan } from './fixtures';
import type { Loop, LoopPlan, LoopRun, RunDigest } from '../../shared/types';

function digest(runNumber: number): RunDigest {
  return {
    runNumber,
    status: 'completed',
    startedAt: 't0',
    endedAt: 't1',
    steps: [{ id: 'a', title: 'First', status: 'failed', attempts: 3, failureSummary: 'edits before reading' }],
    recoveries: [{ stepId: 'a', decision: 'retry-step', reason: 'transient' }],
  };
}

/** A valid revised plan keeping ids stable but rewriting step a's instructions. */
function revisedPlan(): LoopPlan {
  const plan = sequentialPlan().plan;
  return { ...plan, steps: plan.steps.map((s) => (s.id === 'a' ? { ...s, instructions: 'Read the file first, then edit.' } : s)) };
}

function suggestionResponse(): string {
  return JSON.stringify({
    insights: [{ summary: 'step a fails when it edits before reading' }],
    suggestions: [{ rationale: 'a failed 3x editing before reading', confidence: 'high', plan: revisedPlan() }],
  });
}

describe('proposeImprovements', () => {
  it('parses insights + suggestions and derives changed step ids', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    host.modelResponses.push({ response: suggestionResponse() });
    const out = await proposeImprovements(host, loop, [digest(1)]);
    expect(out.insights).toHaveLength(1);
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].status).toBe('pending');
    expect(out.suggestions[0].confidence).toBe('high');
    expect(out.suggestions[0].changedStepIds).toEqual(['a']);
    expect(host.modelCalls[0].platformTools).toBe('none');
  });

  it('returns no suggestions when the model judges nothing worth changing', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    host.modelResponses.push({ response: JSON.stringify({ insights: [{ summary: 'runs cleanly' }], suggestions: [] }) });
    const out = await proposeImprovements(host, loop, [digest(1)]);
    expect(out.suggestions).toHaveLength(0);
    expect(out.insights).toHaveLength(1);
  });

  it('drops a suggestion whose proposed plan is invalid, keeping the valid one', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    host.modelResponses.push({
      response: JSON.stringify({
        insights: [],
        suggestions: [
          { rationale: 'broken', confidence: 'low', plan: { schemaVersion: 1, revision: 0, objective: 'x', steps: [] } },
          { rationale: 'good', confidence: 'medium', plan: revisedPlan() },
        ],
      }),
    });
    const out = await proposeImprovements(host, loop, [digest(1)]);
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].rationale).toBe('good');
    expect(host.logs.some((l) => l.includes('dropped 1 invalid'))).toBe(true);
  });
});

describe('changedStepIds', () => {
  it('flags added, removed, and edited steps', () => {
    const current = sequentialPlan().plan;
    const proposed = revisedPlan();
    expect(changedStepIds(current, proposed)).toEqual(['a']);
  });
});

describe('approve / reject', () => {
  function loopWithPending(host: FakeHost): Loop {
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    return applyReflection(
      loop,
      {
        insights: [],
        suggestions: [
          { id: 'sug-1', createdAt: 't', target: 'plan', rationale: 'fix a', confidence: 'high', proposedPlan: revisedPlan(), changedStepIds: ['a'], status: 'pending' },
        ],
      },
      host.now(),
    );
  }

  it('approve applies the plan through the revise path and records a PlanRevision', () => {
    const host = createFakeHost();
    const loop = loopWithPending(host);
    const result = approveSuggestion(host, loop, 'sug-1');
    expect(result.loop).toBeTruthy();
    expect(result.loop!.suggestions?.[0].status).toBe('approved');
    expect(result.loop!.plan.steps.find((s) => s.id === 'a')!.instructions).toContain('Read the file first');
    expect(result.loop!.revisions.at(-1)?.proposedBy).toBe('model');
    expect(result.loop!.revisions.at(-1)?.status).toBe('applied');
  });

  it('reject records the reason and keeps the suggestion for the feed', () => {
    const host = createFakeHost();
    const loop = loopWithPending(host);
    const result = rejectSuggestion(loop, 'sug-1', 'not worth it', host.now());
    expect(result.loop!.suggestions?.[0].status).toBe('rejected');
    expect(result.loop!.suggestions?.[0].rejectionReason).toBe('not worth it');
  });

  it('refuses to act on an unknown or already-decided suggestion', () => {
    const host = createFakeHost();
    const loop = loopWithPending(host);
    expect(approveSuggestion(host, loop, 'nope').error).toContain('not found');
    const rejected = rejectSuggestion(loop, 'sug-1', 'no', host.now()).loop!;
    expect(approveSuggestion(host, rejected, 'sug-1').error).toContain('already rejected');
  });
});

describe('handleReflectAction', () => {
  function seedWithDigest(host: FakeHost): Loop {
    const loop = seedActiveLoop(host, sequentialPlan().plan);
    return loop;
  }

  it('reflect refuses a loop with no run history', async () => {
    const host = createFakeHost();
    seedWithDigest(host);
    const res = await handleReflectAction(host, { kind: 'reflect', loopId: 'loop-1' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('No runs yet');
  });

  it('reflect queues suggestions and persists them on the loop', async () => {
    const host = createFakeHost();
    const loop = seedWithDigest(host);
    // Give the loop a durable digest so history is non-empty.
    const run: LoopRun = { id: 'r1', runNumber: 1, status: 'completed', startedStepIds: ['a'], stepAttempts: [{ id: 'att', stepId: 'a', attemptNumber: 1, parentSessionId: 'p', executionType: 'background-agent', status: 'failed', outcome: { status: 'failed', summary: 'edits before reading' }, observations: [], startedAt: 't' }], recoveryDecisions: [], observations: [], startedAt: 't' };
    host.artifacts.set(`artifact://loops/${loop.id}/digests.json`, JSON.stringify({ version: 1, digests: [buildRunDigest(loop, run)] }));
    host.modelResponses.push({ response: suggestionResponse() });

    const res = await handleReflectAction(host, { kind: 'reflect', loopId: loop.id });
    expect(res.ok).toBe(true);
    expect(res.reflection?.suggestionCount).toBe(1);
    const stored = host.state.loops[0];
    expect(stored.suggestions?.filter((s) => s.status === 'pending')).toHaveLength(1);
    expect(stored.insights).toHaveLength(1);
  });

  it('choose_suggestion approve applies and marks the suggestion', async () => {
    const host = createFakeHost();
    const loop = applyReflection(
      seedActiveLoop(host, sequentialPlan().plan),
      { insights: [], suggestions: [{ id: 'sug-1', createdAt: 't', target: 'plan', rationale: 'fix', confidence: 'high', proposedPlan: revisedPlan(), changedStepIds: ['a'], status: 'pending' }] },
      host.now(),
    );
    host.state = { ...host.state, loops: [loop] };

    const res = await handleReflectAction(host, { kind: 'choose_suggestion', loopId: loop.id, suggestionId: 'sug-1', decision: 'approve' });
    expect(res.ok).toBe(true);
    expect(host.state.loops[0].suggestions?.[0].status).toBe('approved');
  });

  it('reflect_workspace sweeps loops with history and skips those without', async () => {
    const host = createFakeHost();
    const withHistory = seedActiveLoop(host, sequentialPlan().plan, 'loop-has-runs');
    seedActiveLoop(host, sequentialPlan().plan, 'loop-no-runs');
    const run: LoopRun = { id: 'r1', runNumber: 1, status: 'completed', startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: 't' };
    host.artifacts.set(`artifact://loops/${withHistory.id}/digests.json`, JSON.stringify({ version: 1, digests: [buildRunDigest(withHistory, run)] }));
    host.modelResponses.push({ response: suggestionResponse() });

    const res = await handleReflectAction(host, { kind: 'reflect_workspace' });
    expect(res.ok).toBe(true);
    expect(res.workspaceReflection?.reflected).toBe(1);
    expect(res.workspaceReflection?.perLoop[0].loopId).toBe('loop-has-runs');
    // The durable digest is unchanged for the no-runs loop.
    expect(await readDigests(host, 'loop-no-runs')).toEqual([]);
  });
});
