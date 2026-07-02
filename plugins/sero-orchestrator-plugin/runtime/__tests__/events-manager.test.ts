import { describe, expect, it } from 'vitest';
import { attachDemandSync, deriveSubscriptions, EventSourceManager } from '../events/manager';
import type { EventSourceAdapter, EventSubscription } from '../events/types';
import type { Loop, LoopTrigger, OrchestratorState } from '../../shared/types';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';

function trigger(overrides: Partial<LoopTrigger> = {}): LoopTrigger {
  return { id: 't', loopId: 'loop-1', workspaceId: 'ws-1', type: 'event', eventSource: 'github:ci-failed', fireCount: 0, ...overrides };
}

function stateWith(...loops: Loop[]): OrchestratorState {
  return { version: 1, loops };
}

function recordingAdapter(namespace: string): { adapter: EventSourceAdapter; syncs: EventSubscription[][]; disposed: () => boolean } {
  const syncs: EventSubscription[][] = [];
  let disposed = false;
  return {
    adapter: {
      namespace,
      sync: (subscriptions) => syncs.push(subscriptions),
      dispose: () => {
        disposed = true;
      },
    },
    syncs,
    disposed: () => disposed,
  };
}

describe('deriveSubscriptions', () => {
  it('includes only enabled event/hybrid triggers of active loops with an explicit source', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const active: Loop = {
      ...loop,
      triggers: [
        trigger(),
        trigger({ id: 't2', type: 'hybrid', schedule: '0 8 * * *', eventSource: 'github:pr-opened' }),
        trigger({ id: 't3', disabled: true }),
        trigger({ id: 't4', type: 'cron', schedule: '0 8 * * *', eventSource: undefined }),
        trigger({ id: 't5', eventSource: undefined }), // wildcard: matches at delivery, creates no demand
      ],
    };
    const paused: Loop = { ...loop, id: 'loop-2', status: 'disabled', triggers: [trigger({ loopId: 'loop-2' })] };

    expect(deriveSubscriptions(stateWith(active, paused)).map((s) => s.eventSource)).toEqual([
      'github:ci-failed',
      'github:pr-opened',
    ]);
  });
});

describe('EventSourceManager', () => {
  it('syncs each adapter with its namespace slice, only when demand changes', () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const github = recordingAdapter('github');
    const fs = recordingAdapter('fs');
    const manager = new EventSourceManager([github.adapter, fs.adapter]);

    const withDemand = stateWith({ ...loop, triggers: [trigger(), trigger({ id: 't2', eventSource: 'fs:changed' })] });
    manager.notifyState(withDemand);
    expect(github.syncs).toEqual([[{ loopId: 'loop-1', eventSource: 'github:ci-failed', eventFilter: undefined }]]);
    expect(fs.syncs).toEqual([[{ loopId: 'loop-1', eventSource: 'fs:changed', eventFilter: undefined }]]);

    // Unchanged demand (runtime churn only) does not re-sync.
    manager.notifyState({ ...withDemand });
    expect(github.syncs.length).toBe(1);

    // Pausing the last subscriber empties the slice — adapters told to stop.
    manager.notifyState(stateWith({ ...withDemand.loops[0], status: 'disabled' }));
    expect(github.syncs.at(-1)).toEqual([]);
    expect(fs.syncs.at(-1)).toEqual([]);
  });

  it('dispose stops every adapter', () => {
    const github = recordingAdapter('github');
    const manager = new EventSourceManager([github.adapter]);
    manager.dispose();
    expect(github.disposed()).toBe(true);
  });
});

describe('attachDemandSync', () => {
  it('pushes the post-write state into the manager on every mutation', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const github = recordingAdapter('github');
    const manager = new EventSourceManager([github.adapter]);
    attachDemandSync(host, manager);

    await host.updateState((state) => ({
      ...state,
      loops: state.loops.map((l) => (l.id === loop.id ? { ...l, triggers: [trigger()] } : l)),
    }));
    expect(github.syncs).toEqual([[{ loopId: 'loop-1', eventSource: 'github:ci-failed', eventFilter: undefined }]]);
    // The write itself still landed on the underlying host state.
    expect(host.state.loops[0].triggers).toHaveLength(1);

    await host.updateState((state) => ({
      ...state,
      loops: state.loops.map((l) => ({ ...l, status: 'disabled' as const })),
    }));
    expect(github.syncs.at(-1)).toEqual([]);
  });
});
