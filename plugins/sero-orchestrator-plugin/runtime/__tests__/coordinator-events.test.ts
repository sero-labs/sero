/**
 * Broadcast event delivery (Living Loops, spec 12 — Phase 1). Covers matching
 * (source / filter / model-judged condition, in that order), fresh-pass and
 * stash semantics, restart-safe dedupe, the loop→loop cycle guard, and the
 * event's path into run context.
 */

import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import { createEngineDeps } from '../executors';
import { buildStepTask } from '../executors/prompt';
import type { EngineDeps } from '../engine-types';
import type { LoopTrigger, OrchestratorEvent, PendingInput, StepOutcome } from '../../shared/types';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeExecutor } from './engine-fakes';

const SUCCESS: StepOutcome = { status: 'succeeded', summary: 'ok' };
const NOW = '2026-06-22T10:00:00.000Z';

function coordinator(host: FakeHost, overrides: Partial<EngineDeps> = {}): Coordinator {
  return new Coordinator(host, createEngineDeps(new LoopLocks(), overrides));
}

function eventTrigger(overrides: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: 'e', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'github:ci-failed', fireCount: 0, ...overrides };
}

function ciEvent(overrides: Partial<OrchestratorEvent> = {}): OrchestratorEvent {
  return { id: 'evt-1', source: 'github:ci-failed', payload: {}, occurredAt: NOW, ...overrides };
}

function setTriggers(host: FakeHost, loopId: string, triggers: LoopTrigger[]): void {
  host.state = {
    ...host.state,
    loops: host.state.loops.map((l) => (l.id === loopId ? { ...l, triggers } : l)),
  };
}

function verdict(matches: boolean): { response: string } {
  return { response: `\`\`\`json\n{"matches": ${matches}, "reason": "test"}\n\`\`\`` };
}

describe('fireEvent broadcast', () => {
  it('fires every active loop with a matching trigger, and only those', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan, 'loop-1');
    seedActiveLoop(host, oneStepPlan().plan, 'loop-2');
    seedActiveLoop(host, oneStepPlan().plan, 'loop-3');
    setTriggers(host, 'loop-1', [eventTrigger()]);
    setTriggers(host, 'loop-2', [eventTrigger({ id: 'e2', loopId: 'loop-2' })]);
    setTriggers(host, 'loop-3', [eventTrigger({ id: 'e3', loopId: 'loop-3', eventSource: 'fs:changed' })]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) }).fireEvent(ciEvent());

    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
    expect(host.state.loops[1].runtime.stepStates['step-1'].status).toBe('succeeded');
    expect(host.state.loops[2].runtime.stepStates['step-1'].status).toBe('pending');
    expect(host.state.loops.map((l) => l.triggers[0].fireCount)).toEqual([1, 1, 0]);
  });

  it('matches eventFilter fields in code (strict equality; array = one-of)', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger({ eventFilter: { repo: 'sero', branch: ['main', 'dev'] } })]);
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });

    await c.fireEvent(ciEvent({ payload: { repo: 'sero', branch: 'dev' } }));
    expect(host.state.loops[0].triggers[0].fireCount).toBe(1);

    await c.fireEvent(ciEvent({ id: 'evt-2', payload: { repo: 'other', branch: 'dev' } }));
    await c.fireEvent(ciEvent({ id: 'evt-3', payload: { repo: 'sero', branch: 'feature' } }));
    expect(host.state.loops[0].triggers[0].fireCount).toBe(1); // neither mismatch fired
  });

  it('judges eventCondition by a LOW-tier model call, after the code checks', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger({ eventCondition: 'the failing PR was opened by this loop' })]);
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });

    host.modelResponses.push(verdict(false));
    await c.fireEvent(ciEvent());
    expect(host.modelCalls.length).toBe(1);
    expect(host.modelCalls[0].model).toBe('LOW');
    expect(host.modelCalls[0].platformTools).toBe('none');
    expect(host.state.loops[0].triggers[0].fireCount).toBe(0); // condition said no

    host.modelResponses.push(verdict(true));
    await c.fireEvent(ciEvent({ id: 'evt-2' }));
    expect(host.state.loops[0].triggers[0].fireCount).toBe(1);
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('succeeded');
  });

  it('never calls the model when the code filter already rejected', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger({ eventFilter: { repo: 'sero' }, eventCondition: 'anything' })]);

    await coordinator(host).fireEvent(ciEvent({ payload: { repo: 'other' } }));
    expect(host.modelCalls.length).toBe(0);
  });

  it('an unusable condition verdict skips the fire instead of matching or crashing', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger({ eventCondition: 'x' })]);
    host.modelResponses.push({ response: 'gibberish' }, { response: 'still gibberish' }); // initial + repair

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) }).fireEvent(ciEvent());

    expect(host.state.loops[0].triggers[0].fireCount).toBe(0);
    expect(host.logs.some((l) => l.includes('Event condition'))).toBe(true);
  });

  it("delivers the event into the run: firedBy, an 'event' observation, and the step task", async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger()]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .fireEvent(ciEvent({ payload: { pr: 42 }, summary: 'CI failed on PR #42' }));

    const loop = host.state.loops[0];
    const run = loop.runs.at(-1)!;
    expect(run.firedBy).toEqual({ source: 'github:ci-failed', occurredAt: NOW, summary: 'CI failed on PR #42' });
    const observation = run.observations.find((o) => o.source === 'event')!;
    expect(observation.data).toEqual({ pr: 42 });
    expect(loop.runtime.pendingEvent).toBeUndefined(); // consumed by the run

    const task = buildStepTask(loop, loop.plan.steps[0], run);
    expect(task).toContain('fired by an event');
    expect(task).toContain('"pr": 42');
  });

  it('an event carrying a dedupeKey is delivered at most once', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger()]);
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) });

    await c.fireEvent(ciEvent({ dedupeKey: 'check-run-9' }));
    await c.fireEvent(ciEvent({ id: 'evt-2', dedupeKey: 'check-run-9' })); // adapter restarted and re-emitted

    expect(host.state.loops[0].triggers[0].fireCount).toBe(1);
    expect(host.state.loops[0].runs.length).toBe(1);
    expect(host.state.recentEventKeys).toContain('github:ci-failed#check-run-9');
  });

  it('drops a fire at the loop→loop chain-depth cap with a visible warning', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger({ eventSource: 'loop:completed' })]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .fireEvent(ciEvent({ source: 'loop:completed', chainDepth: 5 }));

    expect(host.state.loops[0].triggers[0].fireCount).toBe(0);
    expect(host.state.loops[0].runs.length).toBe(0);
    expect(host.state.loops[0].warnings.some((w) => w.code === 'event-chain-depth')).toBe(true);
  });

  it("a loop's own events never fire its own triggers", async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger({ eventSource: 'loop:completed' })]);

    await coordinator(host, { executor: fakeExecutor({ 'step-1': SUCCESS }) })
      .fireEvent(ciEvent({ source: 'loop:completed', sourceLoopId: 'loop-1' }));

    expect(host.state.loops[0].triggers[0].fireCount).toBe(0);
  });

  it('a loop parked on a question records the fire but stashes the event', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const pendingInput: PendingInput = {
      id: 'q-1',
      source: 'step',
      stepId: 'step-1',
      questions: [{ id: 'q', prompt: 'Proceed?' }],
      askedAt: NOW,
    };
    host.state = { ...host.state, loops: [{ ...loop, triggers: [eventTrigger()], runtime: { ...loop.runtime, pendingInput } }] };
    const executor = fakeExecutor({ 'step-1': SUCCESS });

    await coordinator(host, { executor }).fireEvent(ciEvent());

    expect(executor.calls).toEqual([]); // nothing ran — the human gate holds
    expect(host.state.loops[0].triggers[0].fireCount).toBe(1);
    expect(host.state.loops[0].runtime.pendingEvent?.id).toBe('evt-1');
  });

  it('tick drains a stashed pending event after a restart', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    host.state = {
      ...host.state,
      loops: [{ ...loop, triggers: [eventTrigger({ fireCount: 1 })], runtime: { ...loop.runtime, pendingEvent: ciEvent() } }],
    };
    const executor = fakeExecutor({ 'step-1': SUCCESS });

    await coordinator(host, { executor }).tick();

    expect(executor.calls).toEqual(['step-1']);
    expect(host.state.loops[0].runtime.pendingEvent).toBeUndefined();
    expect(host.state.loops[0].runs.at(-1)?.firedBy?.source).toBe('github:ci-failed');
  });
});

describe('event loops and completion (found by e2e — an event loop must outlive its runs)', () => {
  const COMPLETE: StepOutcome = {
    status: 'succeeded',
    summary: 'iteration done',
    completion: { status: 'complete', reason: 'this pass is done' },
  };
  const FINAL: StepOutcome = {
    status: 'succeeded',
    summary: 'goal met',
    completion: { status: 'complete', final: true, reason: 'goal met for good' },
  };

  it('an ordinary completion keeps an event-triggered loop active and firing again', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger()]);
    const c = coordinator(host, { executor: fakeExecutor({ 'step-1': COMPLETE }) });

    await c.fireEvent(ciEvent());
    expect(host.state.loops[0].status).toBe('active');
    expect(host.state.loops[0].triggers[0].disabled).toBeFalsy();

    await c.fireEvent(ciEvent({ id: 'evt-2' }));
    expect(host.state.loops[0].triggers[0].fireCount).toBe(2);
    expect(host.state.loops[0].runs).toHaveLength(2);
    expect(host.state.loops[0].status).toBe('active');
  });

  it('an event stashed mid-run is drained into a fresh run after an ordinary completion', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger()]);
    let midRunFired = false;
    const c: Coordinator = coordinator(host, {
      executor: fakeExecutor({
        'step-1': async () => {
          if (!midRunFired) {
            midRunFired = true;
            await c.fireEvent(ciEvent({ id: 'evt-2', summary: 'arrived mid-run' }));
          }
          return COMPLETE;
        },
      }),
    });

    await c.fireEvent(ciEvent());

    const loop = host.state.loops[0];
    expect(loop.runs).toHaveLength(2); // stash consumed into a fresh pass
    expect(loop.runs[1].firedBy?.summary).toBe('arrived mid-run');
    expect(loop.runtime.pendingEvent).toBeUndefined();
    expect(loop.status).toBe('active');
  });

  it('a terminal completion disables event triggers and drops a stashed event VISIBLY', async () => {
    const host = createFakeHost();
    host.frozenNow = NOW;
    seedActiveLoop(host, oneStepPlan().plan);
    setTriggers(host, 'loop-1', [eventTrigger()]);
    let midRunFired = false;
    const c: Coordinator = coordinator(host, {
      executor: fakeExecutor({
        'step-1': async () => {
          if (!midRunFired) {
            midRunFired = true;
            await c.fireEvent(ciEvent({ id: 'evt-2' }));
          }
          return FINAL;
        },
      }),
    });

    await c.fireEvent(ciEvent());

    const loop = host.state.loops[0];
    expect(loop.status).toBe('complete');
    expect(loop.runs).toHaveLength(1); // the stash never becomes a run…
    expect(loop.runtime.pendingEvent).toBeUndefined(); // …and never lingers…
    expect(loop.warnings.some((w) => w.code === 'event-dropped')).toBe(true); // …but is dropped visibly
    expect(loop.triggers[0].disabled).toBe(true); // nothing can fire a completed loop
  });
});
