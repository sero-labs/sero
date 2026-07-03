import { describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import { LoopLocks } from '../locks';
import type { EngineDeps } from '../engine-types';
import type { StepOutcome } from '../../shared/types';
import { reconcileDeliveryWarning } from '../delivery/availability';
import { createFakeHost, type FakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import { fakeDecider, fakeExecutor } from './engine-fakes';

function seedChatLoop(host: FakeHost) {
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  loop.delivery = { destination: 'chat-post', params: { channel: '#intel' } };
  host.state = { ...host.state, loops: [loop] };
  return loop;
}

describe('reconcileDeliveryWarning', () => {
  it('records the warning when the destination tool is missing from the catalog', async () => {
    const host = createFakeHost(); // empty tool catalog
    const loop = seedChatLoop(host);
    const checked = await reconcileDeliveryWarning(host, loop);
    expect(checked.warnings).toHaveLength(1);
    expect(checked.warnings[0].code).toBe('delivery-tool-missing');
    expect(checked.warnings[0].message).toContain('"mcp"');
  });

  it('clears the warning once the tool appears', async () => {
    const host = createFakeHost();
    const loop = seedChatLoop(host);
    const warned = await reconcileDeliveryWarning(host, loop);
    host.toolCatalog = [{ name: 'mcp' }];
    const cleared = await reconcileDeliveryWarning(host, warned);
    expect(cleared.warnings).toHaveLength(0);
  });

  it('needs no check for destinations with no required tools', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan); // workspace-files fixture
    const checked = await reconcileDeliveryWarning(host, loop);
    expect(checked).toBe(loop);
  });

  it('leaves warning state alone when the catalog cannot be listed', async () => {
    const host = createFakeHost();
    const loop = seedChatLoop(host);
    const warned = await reconcileDeliveryWarning(host, loop);
    host.listToolCatalog = async () => { throw new Error('enumeration down'); };
    expect(await reconcileDeliveryWarning(host, warned)).toBe(warned);
  });
});

describe('delivery-tool-missing lifecycle through the engine', () => {
  it('re-evaluates at run start: warns while missing, still runs, clears when the tool appears', async () => {
    const host = createFakeHost();
    seedChatLoop(host);
    const running: StepOutcome = { status: 'succeeded', summary: 'worked' };
    const deps: EngineDeps = { executor: fakeExecutor({ 'step-1': running }), decider: fakeDecider({ decision: 'wait' }), locks: new LoopLocks() };
    const coordinator = new Coordinator(host, deps);

    await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    let loop = host.state.loops[0];
    expect(loop.warnings.map((w) => w.code)).toContain('delivery-tool-missing');
    expect(loop.runs).toHaveLength(1); // fail-soft: the run still happened

    host.toolCatalog = [{ name: 'mcp' }];
    await coordinator.requestAction({ kind: 'run_next', loopId: 'loop-1' });
    loop = host.state.loops[0];
    expect(loop.warnings.map((w) => w.code)).not.toContain('delivery-tool-missing');
  });
});
