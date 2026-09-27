/**
 * Opening and closing the shared store while sessions come and go. The store
 * is a fake, so this runs in plain vitest.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const qmd = vi.hoisted(() => ({ createStore: vi.fn() }));
vi.mock('@tobilu/qmd', () => ({ createStore: qmd.createStore }));

import { acquireIndex, releaseIndex, warmUp } from '../qmd-index';
import { memoryRegistry } from '../registry';

function fakeStore() {
  return {
    listCollections: vi.fn(async () => []),
    addCollection: vi.fn(async () => undefined),
    removeCollection: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    embed: vi.fn(async () => ({ docsProcessed: 0, chunksEmbedded: 0, errors: 0, durationMs: 0 })),
    searchVector: vi.fn(async () => []),
    close: vi.fn(async () => undefined),
  };
}

const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };

describe('shared search index lifecycle', () => {
  let seroHome = '';
  let workspace = '';

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-qmd-life-'));
    workspace = path.join(seroHome, 'project');
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    qmd.createStore.mockReset();
  });

  afterEach(async () => {
    await releaseIndex('cleanup');
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('closes a store that was still opening when the last session left', async () => {
    const store = fakeStore();
    let finishOpen!: () => void;
    qmd.createStore.mockImplementation(() => new Promise((resolve) => {
      finishOpen = () => resolve(store);
    }));

    const opened = acquireIndex('s1', workspace);
    await vi.waitFor(() => expect(qmd.createStore).toHaveBeenCalled());
    const released = releaseIndex('s1');
    finishOpen();
    await opened;
    await released;

    expect(store.close).toHaveBeenCalled();
    expect(memoryRegistry().qmd.store).toBeNull();
  });

  it('tries to open the store again after a failed open', async () => {
    qmd.createStore.mockRejectedValueOnce(new Error('database is locked')).mockResolvedValue(fakeStore());

    expect(await warmUp(workspace)).toBe(false);
    expect(await warmUp(workspace)).toBe(true);
  });
});
