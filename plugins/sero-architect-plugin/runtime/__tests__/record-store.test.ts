import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectRecord, type ProjectRecord } from '../../shared/record';
import type { ArchitectIndex } from '../../shared/types';
import { createRecordStore, type RecordStoreIo } from '../record-store';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function harness(io?: Partial<RecordStoreIo>) {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-store-'));
  dirs.push(homeDir);
  let index: ArchitectIndex | null = null;
  const updateIndex = vi.fn(async (updater: (current: ArchitectIndex | null) => ArchitectIndex) => {
    index = updater(index);
  });
  const store = createRecordStore({ homeDir, indexFile: path.join(homeDir, 'state.json'), updateIndex, io });
  return { homeDir, store, updateIndex, index: () => index };
}

const record = (id: string, stateLine = 'fresh'): ProjectRecord => ({
  ...createProjectRecord({ id, name: id, idea: 'idea', folder: '~/p', now: '2026-09-06T10:00:00.000Z' }),
  stateLine,
});

describe('record store', () => {
  it('writes the record and its index row in one operation', async () => {
    const { store, homeDir, index, updateIndex } = await harness();
    await store.write(record('a', 'one'));

    expect(await store.read('a')).toMatchObject({ id: 'a', stateLine: 'one' });
    expect(index()?.projects).toEqual([expect.objectContaining({ id: 'a', stateLine: 'one', phase: 'intake', needsYou: 0 })]);
    expect(updateIndex).toHaveBeenCalledTimes(1);
    // No temp file survives a successful write.
    expect(await readdir(path.join(homeDir, 'projects'))).toEqual(['a.json']);

    await store.write(record('a', 'two'));
    expect(index()?.projects).toHaveLength(1);
    expect(index()?.projects[0].stateLine).toBe('two');
  });

  it('leaves the previous record readable and the index untouched when a write is interrupted', async () => {
    let failNext = false;
    const { store, homeDir, index, updateIndex } = await harness({
      rename: async (from, to) => {
        if (failNext) { failNext = false; throw new Error('power cut'); }
        const { rename } = await import('node:fs/promises');
        await rename(from, to);
      },
    });
    await store.write(record('a', 'complete'));
    failNext = true;

    await expect(store.write(record('a', 'partial'))).rejects.toThrow('power cut');

    expect(await store.read('a')).toMatchObject({ stateLine: 'complete' });
    expect(JSON.parse(await readFile(path.join(homeDir, 'projects', 'a.json'), 'utf8')).stateLine).toBe('complete');
    expect(await readdir(path.join(homeDir, 'projects'))).toEqual(['a.json']);
    expect(index()?.projects[0].stateLine).toBe('complete');
    expect(updateIndex).toHaveBeenCalledTimes(1);
  });

  it('serialises writes so the last one wins in order', async () => {
    const { store, index } = await harness();
    await Promise.all([store.write(record('a', '1')), store.write(record('a', '2')), store.write(record('b', 'x'))]);
    expect((await store.read('a'))?.stateLine).toBe('2');
    expect(index()?.projects.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('removes the record and its row together, and rebuilds the index from disk', async () => {
    const { store, homeDir, index } = await harness();
    await store.write(record('a'));
    await store.write(record('b'));
    await store.remove('a');
    expect(await store.read('a')).toBeNull();
    expect(index()?.projects.map((p) => p.id)).toEqual(['b']);

    // A stray file that is not a record is ignored; a real one is picked up.
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(homeDir, 'projects', 'junk.json'), '{"nope":true}');
    await writeFile(path.join(homeDir, 'projects', 'c.json'), JSON.stringify(record('c')));
    const rebuilt = await store.rebuildIndex();
    expect(rebuilt.projects.map((p) => p.id).sort()).toEqual(['b', 'c']);
    expect((await store.list()).map((p) => p.id).sort()).toEqual(['b', 'c']);
  });
});
