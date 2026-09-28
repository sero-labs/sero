import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseEntry, serializeEntry, type MemoryEntry } from '../entry-format';
import {
  entriesDir,
  findEntry,
  globalLocation,
  listEntries,
  moveEntry,
  restoreEntry,
  trashDir,
  trashEntry,
  visibleLocations,
  workspaceLocation,
  writeEntry,
} from '../entry-store';

const originalSeroHome = process.env.SERO_HOME;

function entry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'mem-1a2b3c4d',
    type: 'preference',
    scope: 'global',
    created: '2026-09-01',
    confirmed: '2026-09-02',
    replaces: [],
    terms: ['pnpm', 'package manager'],
    body: 'Use pnpm for JS projects.\n\nNever run npm install.',
    ...overrides,
  };
}

describe('entry format', () => {
  it('round-trips every field, including replaces', () => {
    const original = entry({ replaces: ['mem-aaaa1111', 'mem-bbbb2222'] });
    expect(parseEntry(serializeEntry(original))).toEqual(original);
  });

  it('rejects a file without a valid id, type, scope or body', () => {
    const content = serializeEntry(entry());
    expect(parseEntry(content.replace('id: mem-1a2b3c4d', 'id: ../../etc'))).toBeNull();
    expect(parseEntry(content.replace('type: preference', 'type: fact'))).toBeNull();
    expect(parseEntry('no frontmatter')).toBeNull();
    expect(parseEntry(serializeEntry(entry({ body: '' })))).toBeNull();
  });
});

describe('entry store', () => {
  let seroHome = '';
  let workspace = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-store-'));
    workspace = path.join(seroHome, 'project');
    process.env.SERO_HOME = seroHome;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('keeps global and workspace entries in their own folders', async () => {
    await writeEntry(globalLocation(), entry(), 'pinned');
    await writeEntry(workspaceLocation(workspace), entry({ id: 'mem-ws000001', scope: 'workspace' }), 'on-match');

    expect(entriesDir(globalLocation(), 'pinned')).toBe(path.join(seroHome, 'workspaces', 'global', 'memory', 'entries', 'pinned'));
    expect(entriesDir(workspaceLocation(workspace), 'on-match')).toBe(path.join(workspace, '.sero', 'apps', 'memory', 'entries', 'on-match'));
    expect((await listEntries(globalLocation(), 'pinned')).map((item) => item.id)).toEqual(['mem-1a2b3c4d']);
    expect((await listEntries(workspaceLocation(workspace), 'on-match')).map((item) => item.scope)).toEqual(['workspace']);
  });

  it('moves an entry between delivery folders without changing it', async () => {
    const stored = await writeEntry(globalLocation(), entry(), 'pinned');
    const moved = await moveEntry(globalLocation(), stored, 'on-match');

    expect(await listEntries(globalLocation(), 'pinned')).toEqual([]);
    const found = await findEntry(visibleLocations(workspace), stored.id);
    expect(found).toEqual(moved);
    expect(found?.delivery).toBe('on-match');
    expect(found?.body).toBe(stored.body);
  });

  it('restores a trashed entry to the folder it came from', async () => {
    const stored = await writeEntry(globalLocation(), entry(), 'pinned');
    await trashEntry(globalLocation(), stored, 'merged into mem-99999999');

    expect(await findEntry(visibleLocations(workspace), stored.id)).toBeNull();
    expect(await readdir(trashDir(globalLocation()))).toEqual([`${stored.id}.md`]);

    const restored = await restoreEntry(globalLocation(), stored.id);
    expect(restored).toEqual(stored);
    expect(await readdir(trashDir(globalLocation()))).toEqual([]);
  });
});
