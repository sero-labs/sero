import { describe, expect, it, vi } from 'vitest';
import { Coordinator } from '../coordinator';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { createFakeHost } from './fake-host';
import { fakeDecider, fakeExecutor } from './engine-fakes';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { StepAttempt } from '../../shared/types';

async function setup(status: StepAttempt['status'] = 'failed') {
  const host = createFakeHost();
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  loop.delivery = { destination: 'webhook-post', params: { url: 'https://example.test/hook' } };
  const executor = fakeExecutor({ 'step-1': { status: 'failed', summary: 'response lost after send' } });
  await new RunEngine(host, { executor, decider: fakeDecider({ decision: 'retry-step' }), locks: new LoopLocks() }).run(loop.id);
  host.state.loops[0].runs[0].stepAttempts[0].status = status;
  const coordinator = new Coordinator(host);
  const run = vi.spyOn(coordinator, 'runNext').mockResolvedValue({ ok: true });
  return { host, coordinator, run, executor };
}

const actions = {
  retry: (coordinator: Coordinator) => coordinator.retryLoop('loop-1'),
  retryStep: (coordinator: Coordinator) => coordinator.retryStepAction('loop-1', 'step-1'),
  restart: (coordinator: Coordinator) => coordinator.runAgain('loop-1'),
  revise: (coordinator: Coordinator) => coordinator.revise('loop-1', 'try another plan'),
  recovery: (coordinator: Coordinator) => coordinator.chooseRecovery('loop-1', {
    id: 'decision', stepId: 'step-1', failedAttemptId: 'attempt', decision: 'retry-step', reason: 'try again', createdAt: 'now',
  }),
};

describe('destination review before direct recovery', () => {
  for (const status of ['failed', 'cancelled', 'orphaned'] as const) {
    it.each(Object.entries(actions))(`holds %s for an uncertain ${status} external attempt`, async (_name, action) => {
      const { host, coordinator, run, executor } = await setup(status);
      const result = await action(coordinator);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('destination review');
      const pending = host.state.loops[0].runtime.pendingInput;
      expect(pending?.externalDeliveryAttemptId).toBe(host.state.loops[0].runs[0].stepAttempts[0].id);
      await action(coordinator);
      expect(host.state.loops[0].runtime.pendingInput?.id).toBe(pending?.id);
      expect(run).not.toHaveBeenCalled();
      expect(executor.calls).toHaveLength(1);
      expect(host.modelCalls).toHaveLength(0);
    });
  }

  it('keeps a rejected review blocked and permits recovery only for the explicitly reviewed attempt', async () => {
    const { host, coordinator, run } = await setup();
    await coordinator.retryLoop('loop-1');
    const first = host.state.loops[0].runtime.pendingInput!;
    await coordinator.answerInput({ kind: 'answer_input', loopId: 'loop-1', requestId: first.id, answers: [{ questionId: 'destination-reviewed', choiceId: 'hold' }] });
    expect(host.state.loops[0].runtime.stepStates['step-1'].status).toBe('failed');
    expect(run).not.toHaveBeenCalled();
    expect((await coordinator.retryLoop('loop-1')).ok).toBe(false);
    const second = host.state.loops[0].runtime.pendingInput!;
    await coordinator.answerInput({ kind: 'answer_input', loopId: 'loop-1', requestId: second.id, answers: [{ questionId: 'destination-reviewed', choiceId: 'reviewed-safe' }] });
    expect(run).not.toHaveBeenCalled();
    expect((await coordinator.retryStepAction('loop-1', 'step-1')).ok).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    const fresh = host.state.loops[0];
    fresh.runs[0].stepAttempts[0].id = 'later-uncertain-attempt';
    fresh.runtime.stepStates['step-1'].status = 'failed';
    expect((await coordinator.retryStepAction('loop-1', 'step-1')).ok).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });
});
