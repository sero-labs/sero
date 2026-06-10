import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer, type IndexerHost } from './indexer';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexStats } from '../shared/types';

const STATS: WorkspaceIndexStats = { nodes: 10, edges: 20, communities: 2, inputTokens: 100, outputTokens: 50 };

function makeHost(overrides: Partial<IndexerHost> = {}) {
  let state: GraphifyState = structuredClone(DEFAULT_STATE);
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
});
