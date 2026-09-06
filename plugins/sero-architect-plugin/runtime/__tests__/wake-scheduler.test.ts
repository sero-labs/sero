import { describe, expect, it } from 'vitest';
import type { WakeEvent } from '../../shared/wake';
import { createWakeGate } from '../wake-gate';
import { createWakeScheduler } from '../wake-scheduler';

const at = '2026-09-07T09:00:00.000Z';
const wake = (kind: WakeEvent['kind'], ...items: string[]): WakeEvent => ({ kind, at, items });

function harness() {
  const delivered: WakeEvent[] = [];
  let release: () => void = () => undefined;
  let holding = false;
  const gate = createWakeGate();
  gate.release();
  const scheduler = createWakeScheduler({
    gate,
    log: () => undefined,
    deliver: async (_id, event) => {
      delivered.push(event);
      if (holding) await new Promise<void>((resolve) => { release = resolve; });
    },
  });
  return { scheduler, delivered, hold: () => { holding = true; }, letGo: () => { holding = false; release(); } };
}

describe('wake scheduler', () => {
  it('delivers a directive before a completion that arrived first', async () => {
    const { scheduler, delivered, hold, letGo } = harness();
    hold();
    scheduler.request('p', wake('quiet', 'warm-up'));
    await Promise.resolve();
    scheduler.request('p', wake('dispatch-complete', 'loop_1 completed'));
    scheduler.request('p', wake('directive', 'dir_1'));
    letGo();
    await scheduler.idle('p');
    expect(delivered.map((w) => w.kind)).toEqual(['quiet', 'directive', 'dispatch-complete']);
  });

  it('turns two completions during a turn into one wake that names both', async () => {
    const { scheduler, delivered, hold, letGo } = harness();
    hold();
    scheduler.request('p', wake('directive', 'dir_1'));
    await Promise.resolve();
    scheduler.request('p', wake('dispatch-complete', 'loop_1 completed'));
    scheduler.request('p', wake('dispatch-complete', 'loop_2 completed'));
    expect(scheduler.pending('p')).toHaveLength(1);
    letGo();
    await scheduler.idle('p');
    expect(delivered).toHaveLength(2);
    expect(delivered[1]).toEqual({ kind: 'dispatch-complete', at, items: ['loop_1 completed', 'loop_2 completed'] });
  });

  it('holds every wake until the gate opens', async () => {
    const delivered: string[] = [];
    const gate = createWakeGate();
    const scheduler = createWakeScheduler({ gate, log: () => undefined, deliver: async (_id, w) => { delivered.push(w.kind); } });
    scheduler.request('p', wake('directive', 'x'));
    await Promise.resolve();
    expect(delivered).toEqual([]);
    gate.release();
    await scheduler.idle('p');
    expect(delivered).toEqual(['directive']);
  });
});
