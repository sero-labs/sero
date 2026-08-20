/** Spend bookkeeping, settings and the tool upgrade — see indexer.test.ts for the queue. */
import { describe, expect, it, vi } from 'vitest';
import { GraphifyIndexer } from './indexer';
import { DEFAULT_STATE, type WorkspaceIndexStats } from '../shared/types';
import { deliver, enabled, makeHost, request, STATS } from './indexer.fixtures';

describe('GraphifyIndexer — upgrading the tool', () => {
  it('asks before upgrading, and says that rebuilds will pay again', async () => {
    const { host } = makeHost({}, (state) => { state.provisioning.availableVersion = '0.9.48'; });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'upgrade'));
    await indexer.idle();
    expect(host.upgradeGraphify).toHaveBeenCalledWith('0.9.48');
    const body = (host.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0].body as string;
    expect(body).toMatch(/pays full price again/i);
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

describe('GraphifyIndexer — settings are queued, not written by the panel', () => {
  it('merges a settings patch without disturbing the ledger or the workspaces', async () => {
    // The panel persists its whole cached snapshot, so a settings write landing
    // after a build would roll back what the runtime owns. It queues instead.
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
      state.spend = { day: '2026-08-20', usd: 3.5, runs: [] };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, {
      ...request(1, 'settings'),
      settings: { caps: { maxCostPerDayUsd: 25 }, maxConcurrency: 4 },
    });
    await indexer.idle();
    const state = getState();
    expect(state.settings.caps.maxCostPerDayUsd).toBe(25);
    expect(state.settings.caps.maxCostPerBuildUsd).toBe(DEFAULT_STATE.settings.caps.maxCostPerBuildUsd);
    expect(state.settings.maxConcurrency).toBe(4);
    expect(state.spend.usd).toBe(3.5);
    expect(state.workspaces.ws1).toMatchObject({ enabled: true, stats: expect.objectContaining({ nodes: STATS.nodes }) });
    indexer.dispose();
  });

  it('pausing empties the queue instead of only blocking new work', async () => {
    let finish: (stats: WorkspaceIndexStats) => void = () => {};
    const buildGraph = vi.fn(async (
      _workspace: unknown,
      _settings: unknown,
      hooks: { beforePaidSpawn?: () => Promise<void> },
    ) => {
      await hooks.beforePaidSpawn?.();
      return new Promise<{ stats: WorkspaceIndexStats; usageMeasured: boolean }>((resolve) => {
        finish = (stats) => resolve({ stats, usageMeasured: true });
      });
    });
    const { host, getState } = makeHost({ overrides: { buildGraph } });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'), request(2, 'enable', 'ws2'));
    await vi.waitFor(() => expect(getState().workspaces.ws1.status).toBe('building'));

    await deliver(indexer, host, { ...request(3, 'settings'), settings: { paused: true } });
    finish(STATS);
    await indexer.idle();
    expect(buildGraph).toHaveBeenCalledTimes(1); // ws2 never started
    indexer.dispose();
  });

  it('a refused rebuild stays indexed rather than being called "not built"', async () => {
    const { host, getState } = makeHost({
      built: ['ws1'],
      overrides: { confirm: vi.fn().mockResolvedValue(false) },
    }, (state) => enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS }));
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(getState().workspaces.ws1.status).toBe('idle');
    indexer.dispose();
  });

  it('one cap refusal answers the whole batch', async () => {
    const { host } = makeHost({}, (state) => {
      state.settings.caps = { ...state.settings.caps, maxCostPerDayUsd: 0 };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable-all'));
    await indexer.idle();
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect((host.notify as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(1);
    indexer.dispose();
  });
});

describe('GraphifyIndexer — a failed build still costs', () => {
  /** Spawns (so the debit is taken), then fails — the rate-limited case. */
  const failsAfterSpawning = () => vi.fn(async (
    _workspace: unknown,
    _settings: unknown,
    hooks: { beforePaidSpawn?: () => Promise<void> },
  ) => {
    await hooks.beforePaidSpawn?.();
    throw new Error('rate limited');
  });

  it('keeps the authorised debit when the build fails after spending', async () => {
    // An extraction can consume tokens and then exit non-zero, reporting
    // nothing. Without a debit the same workspace could be retried all day
    // against a cap that still reads $0 — and a failing build is the incident
    // that motivated all of this.
    const { host, getState } = makeHost({ overrides: { buildGraph: failsAfterSpawning() } });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();

    const ledger = getState().spend;
    expect(ledger.usd).toBeGreaterThan(0);
    expect(ledger.runs[0]).toMatchObject({ workspaceId: 'ws1', estimated: true });
    indexer.dispose();
  });

  it('settles the debit down to measured usage on success', async () => {
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();

    const ledger = getState().spend;
    expect(ledger.runs).toHaveLength(1);
    expect(ledger.runs[0].estimated).toBe(false);
    // STATS reports 100 in / 50 out, far below the 10,000-token estimate.
    expect(ledger.runs[0].inputTokens).toBe(100);
    expect(ledger.usd).toBeLessThan(0.02);
    indexer.dispose();
  });

  it('a second attempt sees the first attempt in the day total', async () => {
    const { host, getState } = makeHost({ overrides: { buildGraph: failsAfterSpawning() } }, (state) => {
      state.settings.caps = { ...state.settings.caps, maxCostPerDayUsd: 0.03 };
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();
    await deliver(indexer, host, request(2, 'rebuild', 'ws1'));
    await indexer.idle();

    // The first failed attempt debited 0.02, so a second 0.02 passes the cap.
    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(getState().notice?.kind).toBe('cap');
    indexer.dispose();
  });
});

describe('GraphifyIndexer — community naming is a separate paid job', () => {
  it('refuses naming before a graph exists', async () => {
    const { host } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'name-communities', 'ws1'));
    await indexer.idle();
    expect(host.nameCommunities).not.toHaveBeenCalled();
    expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/build and enable/i) }));
    indexer.dispose();
  });

  it('confirms, reserves and settles community naming without rebuilding', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    (host.confirm as ReturnType<typeof vi.fn>).mockClear();
    (host.mergeProfileGraph as ReturnType<typeof vi.fn>).mockClear();

    await deliver(indexer, host, request(1, 'name-communities', 'ws1'));
    await indexer.idle();

    expect(host.nameCommunities).toHaveBeenCalledTimes(1);
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect((host.confirm as ReturnType<typeof vi.fn>).mock.calls[0][0].body).toContain('2 communities');
    expect(getState().spend.runs.at(-1)).toMatchObject({ job: 'community-naming', estimated: false });
    expect(getState().workspaces.ws1.communityNaming).toMatchObject({
      communities: 2,
      inputTokens: 2_100,
      outputTokens: 736,
      model: 'gpt-4.1-mini',
    });
    expect(host.mergeProfileGraph).toHaveBeenCalledWith(['ws1']);
    indexer.dispose();
  });

  it('keeps the reservation when naming fails after the process starts', async () => {
    const nameCommunities = vi.fn(async (
      _workspace: unknown,
      _settings: unknown,
      hooks: { beforePaidSpawn?: () => Promise<void> },
    ) => {
      await hooks.beforePaidSpawn?.();
      throw new Error('provider unavailable');
    });
    const { host, getState } = makeHost({ built: ['ws1'], overrides: { nameCommunities } }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();

    await deliver(indexer, host, request(1, 'name-communities', 'ws1'));
    await indexer.idle();

    expect(getState().spend.runs.at(-1)).toMatchObject({ job: 'community-naming', estimated: true });
    expect(getState().workspaces.ws1.status).toBe('idle');
    expect(getState().workspaces.ws1.lastError).toMatch(/community naming failed/i);
    expect(getState().workspaces.ws1.communityNaming).toBeUndefined();
    indexer.dispose();
  });

  it('drops a rebuild queued after naming for the same workspace', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', { lastBuiltAt: 'yesterday', stats: STATS });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    (host.buildGraph as ReturnType<typeof vi.fn>).mockClear();

    await deliver(
      indexer,
      host,
      request(1, 'name-communities', 'ws1'),
      request(2, 'rebuild', 'ws1'),
    );
    await indexer.idle();

    expect(host.nameCommunities).toHaveBeenCalledTimes(1);
    expect(host.buildGraph).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.communityNaming).toBeDefined();
    indexer.dispose();
  });

  it('drops naming queued after a rebuild for the same workspace', async () => {
    const { host, getState } = makeHost({ built: ['ws1'] }, (state) => {
      enabled(state, 'ws1', {
        lastBuiltAt: 'yesterday',
        stats: STATS,
        communityNaming: {
          communities: 2,
          inputTokens: 100,
          outputTokens: 50,
          model: 'old-model',
          namedAt: 'yesterday',
        },
      });
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await indexer.idle();
    (host.buildGraph as ReturnType<typeof vi.fn>).mockClear();

    await deliver(
      indexer,
      host,
      request(1, 'rebuild', 'ws1'),
      request(2, 'name-communities', 'ws1'),
    );
    await indexer.idle();

    expect(host.buildGraph).toHaveBeenCalledTimes(1);
    expect(host.nameCommunities).not.toHaveBeenCalled();
    expect(getState().workspaces.ws1.communityNaming).toBeUndefined();
    indexer.dispose();
  });
});

describe('GraphifyIndexer — the watermark cannot be rolled back', () => {
  it('ignores a request resurrected by another process overwriting state', async () => {
    // The extension appends from its own process, so one of its writes can land
    // on top of the runtime's and carry an older watermark back with it. The
    // in-memory high-water mark is what stops the paid rebuild running twice.
    const { host, getState } = makeHost();
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'rebuild', 'ws1'));
    await indexer.idle();
    expect(host.buildGraph).toHaveBeenCalledTimes(1);

    // Simulate the clobber: the request is back and the watermark has regressed.
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

  it('does not debit a failure that never reached the model', async () => {
    // A uv install failure or a missing provider key fails before anything can
    // be sent. Charging the day for that is spend the user never incurred.
    const { host, getState } = makeHost({
      overrides: { buildGraph: vi.fn().mockRejectedValue(new Error('No API key configured for OpenAI')) },
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();

    expect(getState().spend.usd).toBe(0);
    expect(getState().spend.runs).toHaveLength(0);
    expect(getState().workspaces.ws1.status).toBe('error');
    indexer.dispose();
  });

  it('keeps the reservation when a successful build reported no usage', async () => {
    // A clean exit is not proof that usage was measured: the token line can be
    // missing or cut from truncated output. Settling on the parser's zeros
    // would write $0 over the debit and hand the daily cap straight back.
    const { host, getState } = makeHost({
      overrides: {
        buildGraph: vi.fn(async (
          workspace: { workspaceId: string },
          _settings: unknown,
          hooks: { beforePaidSpawn?: () => Promise<void> },
        ) => {
          await hooks.beforePaidSpawn?.();
          return { stats: { ...STATS, inputTokens: 0, outputTokens: 0 }, usageMeasured: false };
        }),
      },
    });
    const indexer = new GraphifyIndexer(host);
    await indexer.start();
    await deliver(indexer, host, request(1, 'enable', 'ws1'));
    await indexer.idle();

    expect(getState().spend.usd).toBeGreaterThan(0);
    expect(getState().spend.runs[0].estimated).toBe(true);
    // The graph is still usable; only its cost is unknown.
    expect(getState().workspaces.ws1.status).toBe('idle');
    expect(getState().workspaces.ws1.stats?.costUsd).toBeUndefined();
    indexer.dispose();
  });
});
