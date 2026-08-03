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
  readStateWithIndexes,
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

describe('readStateWithIndexes', () => {
  it('returns defaults when no state file exists yet', async () => {
    const state = await readStateWithIndexes(paths);
    expect(state.schemaVersion).toBe(2);
    expect(state.revision).toBe(0);
    expect(state.settings.generation.variantCount).toBe(3);
  });
});

describe('updateState', () => {
  it('bumps the revision on every write', async () => {
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, sort: 'oldest' } }));
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, sort: 'title' } }));
    const state = await readStateWithIndexes(paths);
    expect(state.revision).toBe(2);
    expect(state.view.sort).toBe('title');
  });

  it('abandons the write when the updater returns null', async () => {
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, sort: 'oldest' } }));
    await updateState(paths, () => null);
    const state = await readStateWithIndexes(paths);
    expect(state.revision).toBe(1);
    expect(state.view.sort).toBe('oldest');
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
    const state = await readStateWithIndexes(paths);
    expect(state.collections).toHaveLength(25);
    expect(state.revision).toBe(25);
  });

  it('keeps the queue alive after a failing updater', async () => {
    const failure = updateState(paths, () => {
      throw new Error('updater exploded');
    });
    await expect(failure).rejects.toThrow('updater exploded');
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, sort: 'oldest' } }));
    expect((await readStateWithIndexes(paths)).view.sort).toBe('oldest');
  });
});

describe('commitState', () => {
  it('rejects a writer holding a stale revision', async () => {
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, sort: 'oldest' } }));
    const stale = await readStateWithIndexes(paths);

    // Someone else writes in between.
    await updateState(paths, (current) => ({ ...current, view: { ...current.view, sort: 'title' } }));

    await expect(
      commitState(paths, { ...stale, view: { ...stale.view, sort: 'newest' } }, stale.revision),
    ).rejects.toBeInstanceOf(StaleStateError);

    expect((await readStateWithIndexes(paths)).view.sort).toBe('title');
  });

  it('accepts a writer holding the current revision', async () => {
    const current = await readStateWithIndexes(paths);
    const committed = await commitState(
      paths,
      { ...current, view: { ...current.view, sort: 'oldest' } },
      current.revision,
    );
    expect(committed.revision).toBe(1);
    expect((await readStateWithIndexes(paths)).view.sort).toBe('oldest');
  });
});

describe('requests', () => {
  it('assigns monotonic ids and reports only unconsumed requests', async () => {
    const first = await appendRequest(paths, { kind: 'analysis.run', itemId: 'i1', force: false });
    const second = await appendRequest(paths, { kind: 'analysis.run', itemId: 'i2', force: false });
    expect(second).toBe(first + 1);

    const state = await readStateWithIndexes(paths);
    expect(pendingRequests(state).map((request) => request.id)).toEqual([first, second]);

    await updateState(paths, (current) => ({ ...current, consumedRequestId: first }));
    expect(pendingRequests(await readStateWithIndexes(paths)).map((request) => request.id)).toEqual([second]);
  });

  it('does not reuse an id after concurrent appends', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        appendRequest(paths, { kind: 'item.favourite', itemId: `i${index}`, favourite: true }),
      ),
    );
    const state = await readStateWithIndexes(paths);
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
