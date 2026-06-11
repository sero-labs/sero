import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer, type IndexerHost } from './indexer';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexStats } from '../shared/types';

const STATS: WorkspaceIndexStats = { nodes: 10, edges: 20, communities: 2, inputTokens: 100, outputTokens: 50 };

function makeHost(overrides: Partial<IndexerHost> = {}, seed?: (state: GraphifyState) => void) {
  let state: GraphifyState = structuredClone(DEFAULT_STATE);
  seed?.(state);
  const host: IndexerHost = {
    readState: async () => structuredClone(state),
    updateState: async (updater) => { state = updater(structuredClone(state)); },
    listWorkspaces: async () => [
      { id: 'ws1', name: 'One', path: '/p/one', open: true },
      { id: 'ws2', name: 'Two', path: '/p/two', open: false },
    ],
    ensureProvisioned: vi.fn().mockResolvedValue(undefined),
    buildGraph: vi.fn().mockResolvedValue(STATS),
    updateGraph: vi.fn().mockResolvedValue(STATS),
    mergeProfileGraph: vi.fn().mockResolvedValue({ nodes: 20, edges: 40 }),
    log: () => {},
    ...overrides,
  };
  return { host, getState: () => state };
}

describe('GraphifyIndexer', () => {
  it('syncs the workspace list into state on start', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(Object.keys(getState().workspaces).sort()).toEqual(['ws1', 'ws2']);
    expect(getState().workspaces.ws1.enabled).toBe(false);
    indexer.dispose();
  });

  it('enable request triggers full build, stats, and profile merge', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({
      ...getState(),
      requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }],
    });
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(host.mergeProfileGraph).toHaveBeenCalledWith(['ws1']);
    expect(getState().workspaces.ws1).toMatchObject({ enabled: true, status: 'idle', stats: STATS });
    expect(getState().requests).toEqual([]);
    expect(getState().profileGraph.status).toBe('ready');
    indexer.dispose();
  });

  it('build failure lands in lastError without breaking the queue', async () => {
    const { host, getState } = makeHost();
    (host.buildGraph as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('no key'));
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({
      ...getState(),
      requests: [
        { id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' },
        { id: 2, action: 'enable', workspaceId: 'ws2', requestedAt: 'now' },
      ],
    });
    await indexer.idle();
    expect(getState().workspaces.ws1).toMatchObject({ status: 'error', lastError: 'no key' });
    expect(getState().workspaces.ws2.status).toBe('idle'); // second job still ran
    indexer.dispose();
  });

  it('disable removes the workspace from merges', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 2, action: 'disable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    expect(getState().workspaces.ws1.enabled).toBe(false);
    indexer.dispose();
  });

  it('does not rebuild or update fresh workspaces on start', async () => {
    const { host } = makeHost({}, (state) => {
      state.workspaces.ws1 = {
        workspaceId: 'ws1', name: 'One', path: '/p/one', enabled: true,
        status: 'idle', lastBuiltAt: new Date().toISOString(), stats: STATS,
      };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(host.updateGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });

  it('catches up stale workspaces with a cheap update on start', async () => {
    const staleTime = new Date(Date.now() - 60 * 60_000).toISOString(); // 1h > 10m interval
    const { host } = makeHost({}, (state) => {
      state.workspaces.ws1 = {
        workspaceId: 'ws1', name: 'One', path: '/p/one', enabled: true,
        status: 'idle', lastBuiltAt: staleTime, stats: STATS,
      };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.updateGraph).toHaveBeenCalledTimes(1);
    expect(host.buildGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });

  it('restarts interrupted full builds on start', async () => {
    const { host } = makeHost({}, (state) => {
      state.workspaces.ws1 = {
        workspaceId: 'ws1', name: 'One', path: '/p/one', enabled: true,
        status: 'building', lastBuiltAt: new Date().toISOString(),
      };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });

  it('keeps the last build token costs when an update reports none', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    expect(getState().workspaces.ws1.stats).toMatchObject({ inputTokens: 100, outputTokens: 50 });

    (host.updateGraph as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ nodes: 12, edges: 22, communities: 3, inputTokens: 0, outputTokens: 0 });
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 2, action: 'refresh', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    expect(getState().workspaces.ws1.stats).toMatchObject({ nodes: 12, edges: 22, inputTokens: 100, outputTokens: 50 });
    indexer.dispose();
  });

  it('streams build progress into the workspace entry and clears it when done', async () => {
    const { host, getState } = makeHost();
    let sawProgress: string | undefined;
    (host.buildGraph as ReturnType<typeof vi.fn>).mockImplementation(
      async (_target: unknown, _settings: unknown, onProgress?: (m: string) => void) => {
        onProgress?.('[graphify extract] scanning files');
        // Give the throttled async state write a tick to land.
        await new Promise((resolve) => setTimeout(resolve, 5));
        sawProgress = getState().workspaces.ws1.progress;
        return STATS;
      },
    );
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    expect(sawProgress).toBe('[graphify extract] scanning files');
    expect(getState().workspaces.ws1.progress).toBeUndefined();
    indexer.dispose();
  });

  it('refreshAll runs incremental updates for enabled workspaces only', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    (host.updateGraph as ReturnType<typeof vi.fn>).mockClear();
    await indexer.refreshAll();
    await indexer.idle();
    expect(host.updateGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });

  it('discovers workspaces created after start without a restart', async () => {
    const live = [{ id: 'ws1', name: 'One', path: '/p/one', open: true }];
    const { host, getState } = makeHost({ listWorkspaces: async () => [...live] });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(Object.keys(getState().workspaces)).toEqual(['ws1']);

    live.push({ id: 'ws-new', name: 'HelloWorld', path: '/p/hello', open: true });
    await indexer.syncWorkspaces();
    expect(getState().workspaces['ws-new']).toMatchObject({ name: 'HelloWorld', enabled: false, status: 'idle' });
    indexer.dispose();
  });

  it('periodic discovery preserves in-flight statuses and skips no-op writes', async () => {
    const { host, getState } = makeHost();
    let writes = 0;
    const baseUpdate = host.updateState;
    host.updateState = async (updater) => { writes += 1; await baseUpdate(updater); };
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    // Simulate an in-flight build between discovery ticks.
    await host.updateState((state) => ({
      ...state,
      workspaces: { ...state.workspaces, ws1: { ...state.workspaces.ws1, enabled: true, status: 'building' } },
    }));
    const before = writes;
    await indexer.syncWorkspaces();
    expect(getState().workspaces.ws1.status).toBe('building');
    expect(writes).toBe(before); // nothing changed → no state write, no bus churn
    indexer.dispose();
  });

  it('drops removed workspaces and re-merges when they were indexed', async () => {
    const live = [
      { id: 'ws1', name: 'One', path: '/p/one', open: true },
      { id: 'ws2', name: 'Two', path: '/p/two', open: false },
    ];
    const { host, getState } = makeHost({ listWorkspaces: async () => [...live] });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.handleStateChange({ ...getState(), requests: [{ id: 1, action: 'enable', workspaceId: 'ws1', requestedAt: 'now' }] });
    await indexer.idle();
    (host.mergeProfileGraph as ReturnType<typeof vi.fn>).mockClear();

    live.splice(0, 1); // ws1 deleted from the profile
    await indexer.syncWorkspaces();
    expect(getState().workspaces.ws1).toBeUndefined();
    expect(getState().profileGraph.status).toBe('absent'); // no indexed workspaces left
    indexer.dispose();
  });

  it('runs discovery on a timer and stops it on dispose', async () => {
    vi.useFakeTimers();
    try {
      const live = [{ id: 'ws1', name: 'One', path: '/p/one', open: true }];
      const { host, getState } = makeHost({ listWorkspaces: async () => [...live] });
      const indexer = new GraphifyIndexer(host);
      await indexer.start();

      live.push({ id: 'ws-new', name: 'HelloWorld', path: '/p/hello', open: true });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getState().workspaces['ws-new']).toMatchObject({ name: 'HelloWorld', enabled: false });

      indexer.dispose();
      live.push({ id: 'ws-late', name: 'TooLate', path: '/p/late', open: true });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(getState().workspaces['ws-late']).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
