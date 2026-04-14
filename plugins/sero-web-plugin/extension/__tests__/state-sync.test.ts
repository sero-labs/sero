import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../shared/types';
import { addBookmark, readState, removeBookmark } from '../state-sync';

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

  it('fails closed on malformed persisted state instead of overwriting it', async () => {
    const statePath = await createTempStatePath();
    await writeFile(statePath, '{not valid json', 'utf8');

    await expect(readState(statePath)).rejects.toThrow(/unreadable/);
    await expect(addBookmark(statePath, 'https://sero.dev', 'Sero')).rejects.toThrow(/unreadable/);
    await expect(readFile(statePath, 'utf8')).resolves.toBe('{not valid json');
  });
});
