import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinderRegistry, FinderUnavailableError } from '../registry';
import { resetFinderSdkCache, setFinderSdkForTesting } from '../sdk';
import { createFakeSdk } from './fixtures/fake-finder';

const DB_PATHS = { frecency: '/profile/fff/frecency', history: '/profile/fff/history' };

afterEach(() => {
  resetFinderSdkCache();
  vi.restoreAllMocks();
});

describe('FinderRegistry', () => {
  it('gives two consumers on the same root one shared finder', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    const first = await registry.acquire({ root: '/repo', consumerId: 'chat' });
    const second = await registry.acquire({ root: '/repo', consumerId: 'subagent' });

    expect(second).toBe(first);
    expect(sdk.created).toHaveLength(1);
    expect(registry.refCount('/repo')).toBe(2);
  });

  it('indexes each distinct root separately', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    await registry.acquire({ root: '/repo-worktree', consumerId: 'chat' });

    expect(sdk.created).toHaveLength(2);
    expect(registry.size()).toBe(2);
  });

  it('counts one consumer once however often it acquires', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    await registry.acquire({ root: '/repo', consumerId: 'chat' });

    expect(registry.refCount('/repo')).toBe(1);
  });

  it('keeps the finder alive while another consumer still holds it', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    await registry.acquire({ root: '/repo', consumerId: 'subagent' });
    registry.release('chat', '/repo');

    expect(sdk.created[0].destroyed).toBe(false);
    expect(registry.refCount('/repo')).toBe(1);
  });

  it('destroys the finder when the last consumer releases it', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    await registry.acquire({ root: '/repo', consumerId: 'subagent' });
    registry.release('chat', '/repo');
    registry.release('subagent', '/repo');

    expect(sdk.created[0].destroyed).toBe(true);
    expect(registry.size()).toBe(0);
  });

  it('releases every root a shutting-down session held', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    await registry.acquire({ root: '/other', consumerId: 'chat' });
    registry.releaseAll('chat');

    expect(sdk.created.every((finder) => finder.destroyed)).toBe(true);
    expect(registry.size()).toBe(0);
  });

  it('scans once when concurrent acquires race on the same root', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    const [a, b, c] = await Promise.all([
      registry.acquire({ root: '/repo', consumerId: 'chat' }),
      registry.acquire({ root: '/repo', consumerId: 'subagent' }),
      registry.acquire({ root: '/repo', consumerId: 'room-member' }),
    ]);

    expect(sdk.created).toHaveLength(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(registry.refCount('/repo')).toBe(3);
  });

  it('re-indexes a root after its finder was destroyed', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    registry.release('chat', '/repo');
    await registry.acquire({ root: '/repo', consumerId: 'chat' });

    expect(sdk.created).toHaveLength(2);
  });

  it('opens the profile-scoped frecency databases', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });

    expect(sdk.initOptions[0]).toMatchObject({
      basePath: '/repo',
      aiMode: true,
      frecencyDbPath: DB_PATHS.frecency,
      historyDbPath: DB_PATHS.history,
    });
  });

  it('never enables home or filesystem-root scanning', async () => {
    const sdk = createFakeSdk();
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });

    expect(sdk.initOptions[0].enableHomeDirScanning).toBeUndefined();
    expect(sdk.initOptions[0].enableFsRootScanning).toBeUndefined();
  });

  it('falls back to a database-less finder when the databases cannot be opened', async () => {
    const sdk = createFakeSdk({ failWithDb: 'lock held by another process' });
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const onDbFailure = vi.fn();
    const registry = new FinderRegistry({ dbPaths: DB_PATHS, onDbFailure });

    const finder = await registry.acquire({ root: '/repo', consumerId: 'chat' });

    expect(finder).toBeDefined();
    expect(registry.databasesDisabled).toBe(true);
    expect(onDbFailure).toHaveBeenCalledWith('lock held by another process');
  });

  it('stops attempting the databases once they have failed', async () => {
    const sdk = createFakeSdk({ failWithDb: 'lock held by another process' });
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await registry.acquire({ root: '/repo', consumerId: 'chat' });
    await registry.acquire({ root: '/other', consumerId: 'chat' });

    expect(sdk.initOptions.filter((init) => init.frecencyDbPath)).toHaveLength(1);
  });

  it('reports the database error when even a database-less finder fails', async () => {
    const sdk = createFakeSdk({ failAlways: 'native library not found' });
    setFinderSdkForTesting({ ok: true, FileFinder: sdk.FileFinder });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await expect(registry.acquire({ root: '/repo', consumerId: 'chat' }))
      .rejects.toThrow(FinderUnavailableError);
  });

  it('surfaces an unloadable native SDK as an unavailable finder', async () => {
    setFinderSdkForTesting({ ok: false, error: 'binary missing for linux-arm64' });
    const registry = new FinderRegistry({ dbPaths: DB_PATHS });

    await expect(registry.acquire({ root: '/repo', consumerId: 'chat' }))
      .rejects.toThrow(/binary missing for linux-arm64/);
  });
});
