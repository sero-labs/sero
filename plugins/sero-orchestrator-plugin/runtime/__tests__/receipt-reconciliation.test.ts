import { expect, it, vi } from 'vitest';
import type { LoopDeliverySettings } from '../../shared/delivery-types';
import { Coordinator } from '../coordinator';
import { RunEngine } from '../run-engine';
import { LoopLocks } from '../locks';
import { createFakeHost } from './fake-host';
import { fakeDecider, fakeExecutor } from './engine-fakes';
import { oneStepPlan, seedActiveLoop } from './fixtures';

async function held(delivery: LoopDeliverySettings = { destination: 'pr' }) {
  const host = createFakeHost();
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  loop.delivery = delivery;
  const executor = fakeExecutor({ 'step-1': ({ run }) => ({
    status: 'succeeded', summary: 'claimed delivery', completion: { status: 'complete', reason: 'done', receipt: {
      destination: delivery.destination, ref: delivery.destination === 'pr' ? 'https://github.com/o/r/pull/1' : 'report.md',
      summary: 'delivered', deliveredAt: host.now(), runId: run.id, planRevision: 0,
      revision: 'a'.repeat(delivery.destination === 'pr' ? 40 : 64),
    } },
  }) });
  host.commandResults.push({ stdout: '', stderr: 'offline', exitCode: 1 });
  await new RunEngine(host, { executor, decider: fakeDecider({ decision: 'retry-step' }), locks: new LoopLocks() }).run(loop.id);
  const coordinator = new Coordinator(host);
  const run = vi.spyOn(coordinator, 'runNext').mockResolvedValue({ ok: true });
  expect(host.state.loops[0].status).toBe('blocked');
  return { host, coordinator, run, executor, loopId: loop.id };
}

it.each([
  { destination: 'pr' },
  { destination: 'webhook-post', params: { url: 'https://example.test/hook' } },
] satisfies LoopDeliverySettings[])('does not bless a held $destination receipt after switching to workspace files', async delivery => {
  const { host, coordinator, run, executor, loopId } = await held(delivery);
  const candidate = host.state.loops[0].runs[0].stepAttempts[0].outcome?.deliveryReview;
  const commands = host.commands.length;
  await coordinator.requestAction({ kind: 'set_delivery', loopId, delivery: { destination: 'workspace-files' } });
  expect((await coordinator.retryLoop(loopId)).ok).toBe(false);
  const current = host.state.loops[0];
  expect(current.status).toBe('blocked');
  expect(current.runtime.deliveries).toBeUndefined();
  expect(current.runtime.pendingInput?.externalDeliveryAttemptId).toBe(current.runs[0].stepAttempts[0].id);
  expect(current.runs[0].stepAttempts[0].outcome?.deliveryReview).toEqual(candidate);
  expect(host.commands).toHaveLength(commands);
  expect(run).not.toHaveBeenCalled();
  expect(executor.calls).toHaveLength(1);
});

it('does not accept an existing artifact against edited delivery parameters', async () => {
  const { host, coordinator, run, loopId } = await held({ destination: 'saved-artifact', params: { name: 'report.md' } });
  const commands = host.commands.length;
  await coordinator.requestAction({ kind: 'set_delivery', loopId, delivery: { destination: 'saved-artifact', params: { name: 'different.md' } } });
  host.commandResults.push({ stdout: '{"ok":true}', stderr: '', exitCode: 0 });
  expect((await coordinator.retryLoop(loopId)).ok).toBe(false);
  expect(host.state.loops[0].runtime.deliveries).toBeUndefined();
  expect(host.commands).toHaveLength(commands);
  expect(run).not.toHaveBeenCalled();
});

it.each(['disable', 'edit'] as const)('keeps a concurrent %s when receipt observation settles', async action => {
  const { host, coordinator, run, executor, loopId } = await held();
  host.state.loops[0].triggers = [{ id: 'cron', loopId, workspaceId: host.workspaceId, type: 'cron', schedule: '0 * * * *', fireCount: 1 }];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let observing!: () => void;
  const started = new Promise<void>(resolve => { observing = resolve; });
  host.runCommand = async () => {
    observing();
    await gate;
    return { stdout: '{"ok":true}', stderr: '', exitCode: 0 };
  };
  const retry = coordinator.retryLoop(loopId);
  await started;
  if (action === 'disable') await coordinator.requestAction({ kind: 'disable', loopId });
  else await coordinator.requestAction({ kind: 'set_delivery', loopId, delivery: { destination: 'workspace-files' } });
  const newer = structuredClone(host.state.loops[0]);
  release();
  expect((await retry).ok).toBe(false);
  expect(host.state.loops[0]).toEqual(newer);
  expect(host.state.loops[0].runtime.deliveries).toBeUndefined();
  expect(run).not.toHaveBeenCalled();
  expect(executor.calls).toHaveLength(1);
  expect(host.modelCalls).toHaveLength(0);
});
