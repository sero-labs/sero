import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ensureCollectionForRoot,
  resolveQmdDbPath,
} from '@plugins/sero-memory-plugin/extension/qmd';

function createStore(collections: Array<{
  name: string;
  pwd: string;
  glob_pattern: string;
  doc_count: number;
  active_count: number;
  last_modified: string | null;
  includeByDefault: boolean;
}> = []) {
  return {
    listCollections: vi.fn(async () => collections),
    addCollection: vi.fn(async () => {}),
    removeCollection: vi.fn(async () => true),
    addContext: vi.fn(async () => true),
    update: vi.fn(async () => ({
      collections: 1,
      indexed: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      needsEmbedding: 0,
    })),
  };
}

afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
});

describe('resolveQmdDbPath', () => {
  it('stores the index inside the active profile agent dir', () => {
    process.env.PI_CODING_AGENT_DIR = '/tmp/sero-profile/agent';

    expect(resolveQmdDbPath()).toBe('/tmp/sero-profile/agent/cache/qmd/index.sqlite');
  });

  it('expands ~/ paths from PI_CODING_AGENT_DIR', () => {
    process.env.PI_CODING_AGENT_DIR = '~/custom-agent';

    expect(resolveQmdDbPath()).toContain('/custom-agent/cache/qmd/index.sqlite');
  });
});

describe('ensureCollectionForRoot', () => {
  it('creates and indexes the collection when missing', async () => {
    const store = createStore();

    const ok = await ensureCollectionForRoot(store, '/tmp/profile-a/workspaces/global');

    expect(ok).toBe(true);
    expect(store.addCollection).toHaveBeenCalledWith('sero-memory', {
      path: '/tmp/profile-a/workspaces/global',
      pattern: '**/*.md',
    });
    expect(store.update).toHaveBeenCalledWith({ collections: ['sero-memory'] });
    expect(store.removeCollection).not.toHaveBeenCalled();
  });

  it('recreates and reindexes the collection when the indexed root is stale', async () => {
    const store = createStore([
      {
        name: 'sero-memory',
        pwd: '/tmp/old-profile/workspaces/global',
        glob_pattern: '**/*.md',
        doc_count: 12,
        active_count: 12,
        last_modified: null,
        includeByDefault: true,
      },
    ]);

    const ok = await ensureCollectionForRoot(store, '/tmp/new-profile/workspaces/global');

    expect(ok).toBe(true);
    expect(store.removeCollection).toHaveBeenCalledWith('sero-memory');
    expect(store.addCollection).toHaveBeenCalledWith('sero-memory', {
      path: '/tmp/new-profile/workspaces/global',
      pattern: '**/*.md',
    });
    expect(store.update).toHaveBeenCalledWith({ collections: ['sero-memory'] });
  });

  it('keeps the existing collection when the root already matches', async () => {
    const store = createStore([
      {
        name: 'sero-memory',
        pwd: '/tmp/profile-a/workspaces/global',
        glob_pattern: '**/*.md',
        doc_count: 12,
        active_count: 12,
        last_modified: null,
        includeByDefault: true,
      },
    ]);

    const ok = await ensureCollectionForRoot(store, '/tmp/profile-a/workspaces/global');

    expect(ok).toBe(true);
    expect(store.removeCollection).not.toHaveBeenCalled();
    expect(store.addCollection).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.addContext).toHaveBeenCalledTimes(3);
  });
});
