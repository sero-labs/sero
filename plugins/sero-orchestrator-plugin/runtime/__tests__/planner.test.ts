import { describe, expect, it } from 'vitest';
import { planLoop } from '../planner';
import { createFakeHost } from './fake-host';
import { oneStepPlan, parallelPlan, planJson, sequentialPlan } from './fixtures';

const req = {
  prompt: 'do something',
  parentSessionId: 'orchestrator:ws-1:loop-1',
  useManagedWorktree: true,
  delivery: { destination: 'pr' as const },
};

describe('planLoop', () => {
  it('returns a validated one-step plan', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.response.plan.steps).toHaveLength(1);
  });

  it('handles sequential and parallel plans', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(sequentialPlan()) });
    const seq = await planLoop(host, req);
    expect(seq.ok).toBe(true);

    host.modelResponses.push({ response: planJson(parallelPlan()) });
    const par = await planLoop(host, req);
    expect(par.ok).toBe(true);
  });

  it('uses a pure model call (no platform tools) with the loop parent session id', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    await planLoop(host, req);
    expect(host.modelCalls[0].platformTools).toBe('none');
    expect(host.modelCalls[0].parentSessionId).toBe('orchestrator:ws-1:loop-1');
  });

  it('tells the planner to deliver (commit/PR) for pr loops, and not for workspace-files', async () => {
    const wt = createFakeHost();
    wt.modelResponses.push({ response: planJson(oneStepPlan()) });
    await planLoop(wt, { ...req, useManagedWorktree: true, delivery: { destination: 'pr' } });
    expect(wt.modelCalls[0].task).toContain('isolated git branch');
    expect(wt.modelCalls[0].task).toContain('pull request');

    const root = createFakeHost();
    root.modelResponses.push({ response: planJson(oneStepPlan()) });
    await planLoop(root, { ...req, useManagedWorktree: false, delivery: { destination: 'workspace-files' } });
    expect(root.modelCalls[0].task).toContain('no commit or PR is needed');
  });

  it('injects the declared destination rules and params into the planning task', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    await planLoop(host, { ...req, useManagedWorktree: false, delivery: { destination: 'chat-post', params: { channel: '#intel' } } });
    expect(host.modelCalls[0].task).toContain('destination: chat-post');
    expect(host.modelCalls[0].task).toContain('#intel');
    // Placement stays orthogonal: root placement text renders even for chat delivery.
    expect(host.modelCalls[0].task).toContain('workspace files (no isolation)');
  });

  it('returns clarifying questions instead of a plan when the model asks', async () => {
    const host = createFakeHost();
    host.modelResponses.push({
      response: JSON.stringify({
        clarifyingQuestions: [{ prompt: 'Which database?', choices: ['Postgres', 'MySQL'] }],
      }),
    });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && outcome.needsInput) {
      expect(outcome.questions).toHaveLength(1);
      expect(outcome.questions[0].prompt).toBe('Which database?');
      expect(outcome.questions[0].choices).toHaveLength(2);
    } else {
      throw new Error('expected needsInput outcome');
    }
    // No repair pass for a clarifying-questions reply.
    expect(host.modelCalls).toHaveLength(1);
  });

  it('folds answered clarifications into a re-plan task', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    await planLoop(host, { ...req, clarifications: [{ prompt: 'Which database?', answer: 'Postgres' }] });
    expect(host.modelCalls[0].task).toContain('answered your earlier questions');
    expect(host.modelCalls[0].task).toContain('Postgres');
  });

  it('repairs once when the first response is invalid', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ not json' });
    host.modelResponses.push({ response: planJson(oneStepPlan()) });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(true);
    expect(host.modelCalls).toHaveLength(2);
    expect(host.modelCalls[1].task).toContain('failed structural validation');
  });

  it('gives up with errors after a failed repair', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '{ not json' });
    host.modelResponses.push({ response: '{"title":"x","summary":"y","plan":{"objective":"o","steps":[]}}' });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && !outcome.needsInput) expect(outcome.errors.length).toBeGreaterThan(0);
    expect(host.modelCalls).toHaveLength(2);
  });

  it('surfaces model call failures', async () => {
    const host = createFakeHost();
    host.modelResponses.push({ response: '', error: 'model exploded' });
    const outcome = await planLoop(host, req);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok && !outcome.needsInput) expect(outcome.errors[0]).toContain('model exploded');
  });
});
