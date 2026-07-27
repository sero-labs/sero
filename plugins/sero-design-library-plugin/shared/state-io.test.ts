import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withLock } from './file-lock';
import { designLibraryPathsFromHome, type DesignLibraryPaths } from './paths';
import {
  StaleStateError,
  appendRequest,
  commitState,
  pendingRequests,
  readState,
  updateState,
} from './state-io';

let home: string;
let paths: DesignLibraryPaths;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'design-library-state-'));
  paths = designLibraryPathsFromHome(home);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('readState', () => {
  it('returns defaults when no state file exists yet', async () => {
    const state = await readState(paths);
    expect(state.items).toEqual([]);
    expect(state.revision).toBe(0);
    expect(state.settings.generation.variantCount).toBe(3);
  });
});

describe('updateState', () => {
  it('bumps the revision on every write', async () => {
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, query: 'a' } }));
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, query: 'b' } }));
    const state = await readState(paths);
    expect(state.revision).toBe(2);
    expect(state.view.query).toBe('b');
  });

  it('abandons the write when the updater returns null', async () => {
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, query: 'kept' } }));
    await updateState(paths, () => null);
    const state = await readState(paths);
    expect(state.revision).toBe(1);
    expect(state.view.query).toBe('kept');
  });

  it('serialises concurrent read-modify-write cycles without losing updates', async () => {
    // Every writer increments the same counter. Interleaved reads would make
    // the last write win and lose the rest.
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        updateState(paths, (current) => ({
          ...current,
          collections: [
            ...current.collections,
            { id: `c${index}`, name: `Collection ${index}`, colour: 'primary', createdAt: index },
          ],
        })),
      ),
    );
    const state = await readState(paths);
    expect(state.collections).toHaveLength(25);
    expect(state.revision).toBe(25);
  });

  it('keeps the queue alive after a failing updater', async () => {
    const failure = updateState(paths, () => {
      throw new Error('updater exploded');
    });
    await expect(failure).rejects.toThrow('updater exploded');
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, query: 'after' } }));
    expect((await readState(paths)).view.query).toBe('after');
  });
});

describe('commitState', () => {
  it('rejects a writer holding a stale revision', async () => {
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, query: 'first' } }));
    const stale = await readState(paths);

    // Someone else writes in between.
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, query: 'newer' } }));

    await expect(
      commitState(paths, { ...stale, view: { ...stale.view, query: 'clobber' } }, stale.revision),
    ).rejects.toBeInstanceOf(StaleStateError);

    expect((await readState(paths)).view.query).toBe('newer');
  });

  it('accepts a writer holding the current revision', async () => {
    const current = await readState(paths);
    const committed = await commitState(
      paths,
      { ...current, view: { ...current.view, query: 'ok' } },
      current.revision,
    );
    expect(committed.revision).toBe(1);
    expect((await readState(paths)).view.query).toBe('ok');
  });
});

describe('requests', () => {
  it('assigns monotonic ids and reports only unconsumed requests', async () => {
    const first = await appendRequest(paths, { kind: 'analysis.run', itemId: 'i1', force: false });
    const second = await appendRequest(paths, { kind: 'analysis.run', itemId: 'i2', force: false });
    expect(second).toBe(first + 1);

    const state = await readState(paths);
    expect(pendingRequests(state).map((request) => request.id)).toEqual([first, second]);

    await updateState(paths, (current) => ({ ...current, consumedRequestId: first }));
    expect(pendingRequests(await readState(paths)).map((request) => request.id)).toEqual([second]);
  });

  it('does not reuse an id after concurrent appends', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        appendRequest(paths, { kind: 'item.favourite', itemId: `i${index}`, favourite: true }),
      ),
    );
    const state = await readState(paths);
    const ids = state.requests.map((request) => request.id);
    expect(new Set(ids).size).toBe(20);
  });
});

describe('withLock', () => {
  it('excludes a second holder until the first releases', async () => {
    const order: string[] = [];
    const first = withLock(paths.lockDir, async () => {
      order.push('first-in');
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push('first-out');
    });
    // Give the first holder time to actually take the lock.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = withLock(paths.lockDir, async () => {
      order.push('second-in');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['first-in', 'first-out', 'second-in']);
  });

  it('reclaims a lock whose owner is gone', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(paths.lockDir, { recursive: true });
    // pid 1 exists but is not us; use an implausible pid that is certainly free.
    await writeFile(
      path.join(paths.lockDir, 'owner.json'),
      JSON.stringify({ pid: 0x7ffffff, acquiredAt: Date.now() }),
      'utf8',
    );
    await expect(withLock(paths.lockDir, async () => 'ran', { timeoutMs: 2000 })).resolves.toBe('ran');
  });
});
