import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer } from './indexer';
import type { WorkspaceIndexStats } from '../shared/types';
import { CURRENT_INDEX_MODE_VERSION } from '../shared/types';
import { deliver, enabled, makeHost, request, STATS } from './indexer.fixtures';

describe('GraphifyIndexer — restart recovery', () => {
  it('does not rebuild a workspace whose build failed', async () => {
    // The old rule restarted a full build for any workspace with no
    // lastBuiltAt, which every failed build has, so it ran again at each launch.
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

  it('catches up an already-built workspace and records the current Graphify version', async () => {
    const updateGraph = vi.fn().mockResolvedValue({ stats: STATS, usageMeasured: false, changed: false });
    const { host, getState } = makeHost({ built: ['ws1'], overrides: { updateGraph } }, (state) => {
      enabled(state, 'ws1', {
        lastBuiltAt: new Date().toISOString(),
        stats: { ...STATS, graphifyVersion: '0.9.46' },
      });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    expect(host.updateGraph).toHaveBeenCalledTimes(1);
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.stats?.graphifyVersion).toBe('0.9.47');
    expect(host.mergeProfileGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });

  it('marks a graph from the old indexing mode for one clean rebuild', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', {
        lastBuiltAt: 'yesterday',
        indexModeVersion: undefined,
      });
      state.profileGraph = { status: 'ready', workspaceIds: ['ws1'] };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();

    expect(host.updateGraph).not.toHaveBeenCalled();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('needs-build');
    expect(getState().profileGraph.status).toBe('absent');
    expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/clean local rebuild/i),
    }));

    await deliver(indexer, host, request(1, 'refresh', 'ws1'));
    await indexer.idle();
    expect(host.updateGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('needs-build');
    indexer.dispose();
  });

  it('excludes old indexing modes from later profile merges', async () => {
    const { host } = makeHost({ built: ['ws1', 'ws2'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', indexModeVersion: undefined });
      enabled(state, 'ws2', { lastBuiltAt: 'yesterday' });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();

    expect(host.mergeProfileGraph).toHaveBeenCalledWith(['ws2']);
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
    const buildGraph = vi.fn(async (
      _workspace: unknown,
    ) => {
      return new Promise<{ stats: WorkspaceIndexStats; usageMeasured: boolean; changed: boolean }>((resolve) => {
        finish = (stats) => resolve({ stats, usageMeasured: false, changed: true });
      });
    });
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
  it('enabling a workspace that already has a graph does not rebuild it', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { enabled: false, indexModeVersion: CURRENT_INDEX_MODE_VERSION });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.enabled).toBe(true);
    indexer.dispose();
  });

  it('rebuild runs a fresh local extraction', async () => {
    const { host } = makeHost({ built: ['ws1'] });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    indexer.dispose();
  });

  it('a first enable builds without a model and merges', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(host.mergeProfileGraph).toHaveBeenCalledWith(['ws1']);
    expect(getState().workspaces.ws1.stats).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      graphifyVersion: '0.9.47',
    });
    expect(getState().workspaces.ws1.indexModeVersion).toBe(CURRENT_INDEX_MODE_VERSION);
    expect(host.confirm).not.toHaveBeenCalled();
    indexer.dispose();
  });
});

describe('GraphifyIndexer — safety boundaries', () => {
  it('refuses a workspace the host registry does not know', async () => {
    // Building one anyway would be deleted by the next sync.
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

  it('does not start local work while paused', async () => {
    const { host } = makeHost({}, (state) => { state.settings.paused = true; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    indexer.dispose();
  });
});

describe('GraphifyIndexer — build records', () => {
  it('keeps a record of a graph that was built and then removed', async () => {
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
      overrides: { buildGraph: vi.fn().mockRejectedValue(new Error('extract failed')) },
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    expect(getState().workspaces.ws1).toMatchObject({ status: 'error', lastError: 'extract failed', failureCount: 1 });
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(host.mergeProfileGraph).not.toHaveBeenCalled();
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
