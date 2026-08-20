import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer, type IndexerHost } from './indexer';
import { DEFAULT_STATE, type GraphifyState, type ModelChoice, type WorkspaceIndexStats } from '../shared/types';

const STATS: WorkspaceIndexStats = { nodes: 10, edges: 20, communities: 2, inputTokens: 100, outputTokens: 50 };
const MODEL: ModelChoice = { backend: 'openai', modelId: 'gpt-4.1-mini', chosenAt: 'now' };

interface HostOptions {
  /** Workspace ids whose graph is already on disk. */
  built?: string[];
  overrides?: Partial<IndexerHost>;
}

function makeHost(options: HostOptions = {}, seed?: (state: GraphifyState) => void) {
  let state: GraphifyState = structuredClone(DEFAULT_STATE);
  state.settings.model = MODEL;
  seed?.(state);
  const built = new Set(options.built ?? []);
  const host: IndexerHost = {
    readState: async () => structuredClone(state),
    updateState: async (updater) => { state = updater(structuredClone(state)); },
    listWorkspaces: async () => [
      { id: 'ws1', name: 'One', path: '/p/one', open: true },
      { id: 'ws2', name: 'Two', path: '/p/two', open: false },
    ],
    ensureProvisioned: vi.fn().mockResolvedValue(undefined),
    graphExists: async (id) => built.has(id),
    graphifyVersion: async () => '0.9.47',
    estimateBuild: async () => ({ files: 10, bytes: 40_000, truncated: false, estimatedInputTokens: 10_000, estimatedCostUsd: 0.02 }),
    confirm: vi.fn().mockResolvedValue(true),
    notify: vi.fn(),
    buildGraph: vi.fn().mockImplementation(async (workspace: { workspaceId: string }) => {
      built.add(workspace.workspaceId);
      return STATS;
    }),
    updateGraph: vi.fn().mockResolvedValue(STATS),
    mergeProfileGraph: vi.fn().mockResolvedValue({ nodes: 20, edges: 40 }),
    removeWorkspaceArtifacts: vi.fn().mockResolvedValue(undefined),
    listArtifactWorkspaceIds: vi.fn().mockResolvedValue([]),
    log: () => {},
    ...options.overrides,
  };
  return { host, getState: () => state };
}

function request(id: number, action: string, workspaceId?: string) {
  return { id, action, workspaceId, requestedAt: 'now' } as GraphifyState['requests'][number];
}

/**
 * Queue a request the way the extension does — into the state file — then hand
 * the runtime the resulting snapshot. The indexer drains from stored state, not
 * from the delivered object, which is what makes a repeated delivery harmless.
 */
async function deliver(
  indexer: GraphifyIndexer,
  host: IndexerHost,
  ...requests: GraphifyState['requests']
): Promise<GraphifyState> {
  await host.updateState((state) => ({ ...state, requests: [...state.requests, ...requests] }));
  const snapshot = (await host.readState())!;
  await indexer.handleStateChange(snapshot);
  return snapshot;
}

function enabled(state: GraphifyState, id: string, patch: Partial<GraphifyState['workspaces'][string]> = {}) {
  state.workspaces[id] = {
    workspaceId: id, name: id === 'ws1' ? 'One' : 'Two', path: `/p/${id}`,
    enabled: true, status: 'idle', ...patch,
  };
}

describe('GraphifyIndexer — a restart never spends', () => {
  it('does not rebuild a workspace whose build failed', async () => {
    // The old rule restarted a full build for any workspace with no
    // lastBuiltAt, which every failed build has — so a failure was paid for
    // again at every launch.
    const { host, getState } = makeHost({}, (state) => {
      enabled(state, 'ws1', { status: 'error', lastError: 'no key', failureCount: 1 });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('needs-build');
    indexer.dispose();
  });

  it('does not build a workspace that was interrupted mid-build', async () => {
    const { host, getState } = makeHost({}, (state) => enabled(state, 'ws1', { status: 'building' }));
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('needs-build');
    indexer.dispose();
  });

  it('catches up an already-built workspace with the free AST update', async () => {
    const { host } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: new Date().toISOString(), stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.updateGraph).toHaveBeenCalledTimes(1);
    expect(host.buildGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });
});

describe('GraphifyIndexer — one action, one build', () => {
  it('builds once when the same request list is delivered twice', async () => {
    // The state-file watcher fires on both the rename and the change of an
    // atomic write, so the same request can arrive twice.
    const { host } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    const delivery = await deliver(indexer, host, request(1, 'enable', 'ws1'));
    // The identical snapshot arriving a second time must not build again.
    await indexer.handleStateChange(delivery);
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });

  it('ignores a request at or below the applied watermark', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(getState().lastAppliedRequestId).toBe(1);

    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });

  it('does not queue a second build for a workspace already building', async () => {
    let finish: (stats: WorkspaceIndexStats) => void = () => {};
    const buildGraph = vi.fn(() => new Promise<WorkspaceIndexStats>((resolve) => { finish = resolve; }));
    const { host, getState } = makeHost({ overrides: { buildGraph } });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await vi.waitFor(() => expect(getState().workspaces.ws1.status).toBe('building'));

    await deliver(indexer, host, request(2, 'refresh', 'ws1'));
    finish(STATS);
    await indexer.idle();
    expect(buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });
});

describe('GraphifyIndexer — enable is not rebuild', () => {
  it('enabling a workspace that already has a graph costs nothing', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.enabled).toBe(true);
    indexer.dispose();
  });

  it('rebuild always spends', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });

  it('a first enable builds, records the model, and merges', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(host.mergeProfileGraph).toHaveBeenCalledWith(['ws1']);
    expect(getState().workspaces.ws1.stats).toMatchObject({ model: 'gpt-4.1-mini', backend: 'openai', graphifyVersion: '0.9.47' });
    indexer.dispose();
  });
});

describe('GraphifyIndexer — what it refuses to spend on', () => {
  it('refuses every paid job while no model is chosen', async () => {
    const { host, getState } = makeHost({}, (state) => { state.settings.model = null; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().notice?.message).toMatch(/model/i);
    indexer.dispose();
  });

  it('refuses a workspace the host registry does not know', async () => {
    // Building one anyway was paid for and then deleted by the next sync.
    const { host } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ghost'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(host.removeWorkspaceArtifacts).not.toHaveBeenCalledWith('ghost');
    indexer.dispose();
  });

  it('refuses the global workspace, which holds the memory store', async () => {
    const { host } = makeHost({
      overrides: { listWorkspaces: async () => [{ id: 'global', name: 'Global', path: '/p/global', open: true }] },
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'global'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });

  it('stops the queue when a build would pass the daily cap', async () => {
    const { host, getState } = makeHost({}, (state) => {
      state.settings.caps = { ...state.settings.caps, maxCostPerDayUsd: 1 };
      state.spend = { day: new Date().toISOString().slice(0, 10), usd: 0.99, runs: [] };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().notice?.kind).toBe('cap');
    indexer.dispose();
  });

  it('does not spend when the confirmation is declined', async () => {
    const { host, getState } = makeHost({ overrides: { confirm: vi.fn().mockResolvedValue(false) } });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('needs-build');
    indexer.dispose();
  });

  it('refuses paid work while paused', async () => {
    const { host, getState } = makeHost({}, (state) => { state.settings.paused = true; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });
});

describe('GraphifyIndexer — the record of what was spent', () => {
  it('adds a completed build to the day ledger', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    const ledger = getState().spend;
    expect(ledger.runs).toHaveLength(1);
    expect(ledger.runs[0]).toMatchObject({ workspaceId: 'ws1', model: 'gpt-4.1-mini' });
    expect(ledger.usd).toBeGreaterThan(0);
    indexer.dispose();
  });

  it('keeps a record of a graph that was paid for and then removed', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();

    (host.listWorkspaces as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue([
      { id: 'ws2', name: 'Two', path: '/p/two', open: false },
    ]);
    await indexer.syncWorkspaces();
    expect(getState().removedWorkspaces.map((entry) => entry.workspaceId)).toContain('ws1');
    expect(host.removeWorkspaceArtifacts).toHaveBeenCalledWith('ws1');
    indexer.dispose();
  });

  it('a failed build records the failure and never retries itself', async () => {
    const { host, getState } = makeHost({
      overrides: { buildGraph: vi.fn().mockRejectedValue(new Error('no key')) },
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(getState().workspaces.ws1).toMatchObject({ status: 'error', lastError: 'no key', failureCount: 1 });
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });
});

describe('GraphifyIndexer — discovery', () => {
  it('syncs the workspace list into state on start', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(Object.keys(getState().workspaces).sort()).toEqual(['ws1', 'ws2']);
    expect(getState().workspaces.ws1.enabled).toBe(false);
    indexer.dispose();
  });

  it('sets no timers: nothing fires after start without explicit requests', async () => {
    vi.useFakeTimers();
    const { host } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    (host.listWorkspaces as ReturnType<typeof vi.fn>).mockClear?.();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(host.buildGraph).not.toHaveBeenCalled();
    vi.useRealTimers();
    indexer.dispose();
  });

  it('disable removes the workspace from merges', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday' });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'disable', 'ws1'));
    await indexer.idle();
    expect(getState().workspaces.ws1.enabled).toBe(false);
    expect(host.mergeProfileGraph).not.toHaveBeenCalledWith(['ws1']);
    indexer.dispose();
  });

  it('sweeps orphaned artifacts on start but keeps live workspaces', async () => {
    const { host } = makeHost({
      overrides: { listArtifactWorkspaceIds: vi.fn().mockResolvedValue(['ws1', 'gone']) },
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.removeWorkspaceArtifacts).toHaveBeenCalledWith('gone');
    expect(host.removeWorkspaceArtifacts).not.toHaveBeenCalledWith('ws1');
    indexer.dispose();
  });
});
