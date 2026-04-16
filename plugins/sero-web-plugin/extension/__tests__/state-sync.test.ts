import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../shared/types';
import {
  addBookmark,
  clearHistory,
  readState,
  removeBookmark,
  removeDownload,
  syncEntryToState,
  upsertDownload,
} from '../state-sync';

const tempDirs: string[] = [];

async function createTempStatePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'sero-web-state-'));
  tempDirs.push(dir);
  return join(dir, 'state.json');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('web state sync', () => {
  it('bootstraps missing state files with the shared default shape', async () => {
    const statePath = await createTempStatePath();

    await expect(readState(statePath)).resolves.toEqual(DEFAULT_STATE);
  });

  it('dedupes bookmarks by URL instead of creating duplicate entries', async () => {
    const statePath = await createTempStatePath();

    const created = await addBookmark(statePath, 'https://sero.dev', 'Sero');
    const updated = await addBookmark(
      statePath,
      'https://sero.dev',
      'Sero Docs',
      'Docs',
      ['reference'],
    );

    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('Sero Docs');
    expect(updated.description).toBe('Docs');
    expect(updated.tags).toEqual(['reference']);

    const state = await readState(statePath);
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0]).toMatchObject({
      id: created.id,
      url: 'https://sero.dev',
      title: 'Sero Docs',
      description: 'Docs',
      tags: ['reference'],
    });

    await expect(removeBookmark(statePath, created.id)).resolves.toBe(true);
    await expect(readState(statePath)).resolves.toMatchObject({ bookmarks: [] });
  });

  it('clears history without disturbing bookmark and download state', async () => {
    const statePath = await createTempStatePath();

    await syncEntryToState(statePath, {
      id: 'entry-1',
      type: 'search',
      timestamp: Date.now(),
      queries: [
        {
          query: 'sero',
          answer: 'result',
          results: [{ title: 'Sero', url: 'https://sero.dev' }],
          error: null,
        },
      ],
    });
    await upsertDownload(statePath, {
      id: 'download-1',
      sourceUrl: 'https://sero.dev/file.pdf',
      title: 'Guide',
      status: 'completed',
      phase: 'Done',
      progressPct: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const clearedAt = await clearHistory(statePath);
    const state = await readState(statePath);

    expect(clearedAt).toBeGreaterThan(0);
    expect(state.entries).toEqual([]);
    expect(state.historyClearedAt).toBe(clearedAt);
    expect(state.downloads).toHaveLength(1);
  });

  it('removes downloads from persisted state after deletion', async () => {
    const statePath = await createTempStatePath();

    await upsertDownload(statePath, {
      id: 'download-1',
      sourceUrl: 'https://sero.dev/file.pdf',
      title: 'Guide',
      status: 'completed',
      phase: 'Done',
      progressPct: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await removeDownload(statePath, 'download-1');

    await expect(readState(statePath)).resolves.toMatchObject({ downloads: [] });
  });

  it('fails closed on malformed persisted state instead of overwriting it', async () => {
    const statePath = await createTempStatePath();
    await writeFile(statePath, '{not valid json', 'utf8');

    await expect(readState(statePath)).rejects.toThrow(/unreadable/);
    await expect(addBookmark(statePath, 'https://sero.dev', 'Sero')).rejects.toThrow(/unreadable/);
    await expect(readFile(statePath, 'utf8')).resolves.toBe('{not valid json');
  });
});
