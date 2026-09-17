/**
 * Explicit trigger intent (spec orchestrator-dispatch-handle).
 *
 * Extracting a trigger is a separate model call, and it is worth making when the
 * caller left recurrence to natural language. It is a wasted call when the caller
 * already said the work happens once, or already supplied validated triggers. The
 * distinction must not weaken validation or skip planning.
 */

import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { createFakeHost } from './fake-host';
import { oneStepPlan, planJson } from './fixtures';

/** The planner's answer. The extractor, when it runs, is the call after this one. */
const plan = () => ({ response: planJson(oneStepPlan()) });
/** What the extractor would answer if it were asked. */
const recurrence = () => ({ response: JSON.stringify({ recurring: true, schedule: '0 9 * * *', events: [] }) });

describe('explicit trigger intent', () => {
  it('does not ask a model whether a one-off milestone recurs', async () => {
    const host = createFakeHost();
    host.modelResponses.push(plan());

    const result = await new Coordinator(host).requestAction({
      kind: 'create',
      prompt: 'Build the grid',
      options: { requestId: 'dispatch-1', triggerIntent: 'one-off', triggers: [] },
    });

    expect(result.ok).toBe(true);
    // The planner ran. Nothing ran to decide recurrence.
    expect(host.modelCalls).toHaveLength(1);
    expect(host.state.loops).toHaveLength(1);
    // And one-off means one-off: the plan still exists, with nothing scheduled.
    expect(host.state.loops[0]!.plan.steps.length).toBeGreaterThan(0);
    expect(host.state.loops[0]!.triggers ?? []).toHaveLength(0);
  });

  it('keeps supplied triggers without rediscovering them', async () => {
    const host = createFakeHost();
    host.modelResponses.push(plan());

    const result = await new Coordinator(host).requestAction({
      kind: 'create',
      prompt: 'Check the issues every morning',
      options: {
        requestId: 'dispatch-2',
        triggerIntent: 'supplied',
        triggers: [{ type: 'cron', schedule: '0 9 * * *' }],
      },
    });

    expect(result.ok).toBe(true);
    expect(host.modelCalls).toHaveLength(1);
    // The supplied schedule is the one that survives, not a second opinion.
    expect(host.state.loops[0]!.triggers).toHaveLength(1);
    expect(host.state.loops[0]!.triggers[0]).toMatchObject({ type: 'cron', schedule: '0 9 * * *' });
  });

  it('still extracts natural-language recurrence when the caller leaves it unspecified', async () => {
    const host = createFakeHost();
    host.modelResponses.push(plan(), recurrence());

    const result = await new Coordinator(host).requestAction({
      kind: 'create',
      prompt: 'Every morning at 9, check the issues',
      options: { requestId: 'dispatch-3' },
    });

    expect(result.ok).toBe(true);
    // The planner, then the extractor. An unspecified caller keeps the call.
    expect(host.modelCalls).toHaveLength(2);
    expect(host.state.loops[0]!.triggers?.length ?? 0).toBeGreaterThan(0);
  });

  it('treats supplied triggers without an explicit intent as supplied', async () => {
    // An older caller that sets triggers and no intent keeps its existing
    // meaning, so the skip applies there too.
    const host = createFakeHost();
    host.modelResponses.push(plan());

    const result = await new Coordinator(host).requestAction({
      kind: 'create',
      prompt: 'Check the issues every morning',
      options: { requestId: 'dispatch-4', triggers: [{ type: 'cron', schedule: '30 7 * * *' }] },
    });

    expect(result.ok).toBe(true);
    expect(host.modelCalls).toHaveLength(1);
    expect(host.state.loops[0]!.triggers[0]).toMatchObject({ schedule: '30 7 * * *' });
  });

  it('keeps a one-off declaration through a planner clarification, and never asks the extractor', async () => {
    const host = createFakeHost();
    // The planner asks a clarifying question instead of planning outright.
    host.modelResponses.push({
      response: JSON.stringify({ clarifyingQuestions: [{ prompt: 'Which repo does the milestone target?', choices: ['a', 'b'] }] }),
    });

    const created = await new Coordinator(host).requestAction({
      kind: 'create',
      prompt: 'Build the grid',
      options: { requestId: 'dispatch-5', triggerIntent: 'one-off' },
    });
    expect(created.ok).toBe(true);
    const loop = created.loop!;
    expect(loop.runtime.pendingInput?.source).toBe('planner');
    const requestId = loop.runtime.pendingInput!.id;
    const questionId = loop.runtime.pendingInput!.questions[0].id;

    // Answer the planner's question. The one-off intent recorded at creation
    // must carry into the re-plan without asking the extractor again.
    host.modelResponses.push(plan());
    const answered = await new Coordinator(host).requestAction({
      kind: 'answer_input',
      loopId: loop.id,
      requestId,
      answers: [{ questionId, text: 'a' }],
    });

    expect(answered.ok).toBe(true);
    const finished = answered.loop!;
    expect(finished.runtime.pendingInput).toBeUndefined();
    expect(finished.plan.steps.length).toBeGreaterThan(0);
    // Only the planner ran — no second call to decide recurrence.
    expect(host.modelCalls).toHaveLength(2);
    expect(finished.triggers ?? []).toHaveLength(0);
  });
});
