import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer } from './indexer';
import type { WorkspaceIndexStats } from '../shared/types';
import { deliver, enabled, makeHost, request, STATS } from './indexer.fixtures';

describe('GraphifyIndexer — tool upgrades', () => {
  it('asks before upgrading and describes a local rebuild', async () => {
    const { host } = makeHost({}, (state) => { state.provisioning.availableVersion = '0.9.48'; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'upgrade'));
    await indexer.idle();

    expect(host.upgradeGraphify).toHaveBeenCalledWith('0.9.48');
    const body = (host.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0].body as string;
    expect(body).toMatch(/local rebuild/i);
    expect(body).not.toMatch(/price|paid|cost/i);
    indexer.dispose();
  });

  it('does not upgrade when the dialog is declined', async () => {
    const { host } = makeHost({
      overrides: { confirm: vi.fn().mockResolvedValue(false) },
    }, (state) => { state.provisioning.availableVersion = '0.9.48'; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'upgrade'));
    await indexer.idle();

    expect(host.upgradeGraphify).not.toHaveBeenCalled();
    indexer.dispose();
  });
});

describe('GraphifyIndexer — local controls', () => {
  it('merges pause and exclude settings without disturbing workspace state', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, {
      ...request(1, 'settings'),
      settings: { paused: true, exclude: ['vendor'] },
    });
    await indexer.idle();

    expect(getState().settings.paused).toBe(true);
    expect(getState().settings.exclude).toEqual(['vendor']);
    expect(Object.keys(getState().workspaces)).toEqual(['ws1', 'ws2']);
    indexer.dispose();
  });

  it('pausing empties the queued local work', async () => {
    let finish: (stats: WorkspaceIndexStats) => void = () => {};
    const buildGraph = vi.fn(async () => new Promise<{ stats: WorkspaceIndexStats; usageMeasured: boolean; changed: boolean }>((resolve) => {
      finish = (stats) => resolve({ stats, usageMeasured: false, changed: true });
    }));
    const { host, getState } = makeHost({ overrides: { buildGraph } });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'), request(2, 'enable', 'ws2'));
    await vi.waitFor(() => expect(getState().workspaces.ws1.status).toBe('building'));

    await deliver(indexer, host, { ...request(3, 'settings'), settings: { paused: true } });
    finish(STATS);
    await indexer.idle();

    expect(buildGraph).toHaveBeenCalledTimes(1);
    expect(getState().workspaces.ws2.status).toBe('needs-build');
    indexer.dispose();
  });

  it('does not leave a folded rebuild marked as queued when pause cancels it', async () => {
    let finish: (stats: WorkspaceIndexStats) => void = () => {};
    const updateGraph = vi.fn(async () => new Promise<{ stats: WorkspaceIndexStats; usageMeasured: boolean; changed: boolean }>((resolve) => {
      finish = (stats) => resolve({ stats, usageMeasured: false, changed: true });
    }));
    const { host, getState } = makeHost({ built: ['ws1'], overrides: { updateGraph } }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await vi.waitFor(() => expect(getState().workspaces.ws1.status).toBe('updating'));

    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    expect(getState().workspaces.ws1.status).toBe('updating');
    await deliver(indexer, host, { ...request(2, 'settings'), settings: { paused: true } });
    finish(STATS);
    await indexer.idle();

    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('idle');
    indexer.dispose();
  });

  it('explains when a build request is dropped while paused', async () => {
    const { host, getState } = makeHost({}, (state) => { state.settings.paused = true; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();

    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.status).toBe('needs-build');
    expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'info',
      message: expect.stringMatching(/paused.*not indexed/i),
    }));
    indexer.dispose();
  });

  it('does not notify for automatic refreshes while paused', async () => {
    const { host } = makeHost({ built: ['ws1'] }, (state) => {
      state.settings.paused = true;
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();

    expect(host.updateGraph).not.toHaveBeenCalled();
    expect(host.notify).not.toHaveBeenCalled();
    indexer.dispose();
  });

  it('does not ask for a model or spend confirmation', async () => {
    const { host } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();

    expect(host.confirm).not.toHaveBeenCalled();
    indexer.dispose();
  });

  it('explains an empty code-only graph', async () => {
    const buildGraph = vi.fn().mockResolvedValue({
      stats: { ...STATS, nodes: 0, edges: 0, communities: 0 },
      usageMeasured: false,
      changed: true,
    });
    const { host } = makeHost({ overrides: { buildGraph } });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();

    expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'info',
      message: expect.stringMatching(/no supported code.*empty/i),
    }));
    indexer.dispose();
  });
});

describe('GraphifyIndexer — request watermark', () => {
  it('ignores a request resurrected by another process', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();

    await host.updateState((state) => ({
      ...state,
      requests: [request(1, 'rebuild', 'ws1')],
      lastAppliedRequestId: 0,
    }));
    await indexer.handleStateChange((await host.readState())!);
    await indexer.idle();

    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(getState().lastAppliedRequestId).toBe(1);
    indexer.dispose();
  });
});
