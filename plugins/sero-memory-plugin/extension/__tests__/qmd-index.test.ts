/**
 * What the search index holds, on the real QMD store. QMD needs the
 * better-sqlite3 build for Electron, so this runs with `pnpm test:qmd`, which
 * starts vitest under Electron's Node; plain `pnpm test` skips it.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Embedding downloads a model; which files each collection holds does not depend on it.
vi.mock('@tobilu/qmd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tobilu/qmd')>();
  return {
    ...actual,
    createStore: async (...args: Parameters<typeof actual.createStore>) => {
      const store = await actual.createStore(...args);
      return Object.assign(store, { embed: async () => ({ docsProcessed: 0, chunksEmbedded: 0, errors: 0, durationMs: 0 }), searchVector: async () => [] });
    },
  };
});

import { collectionsFor, releaseIndex, warmUp } from '../qmd-index';
import { memoryRegistry } from '../registry';
import { globalLocation, workspaceLocation } from '../entry-store';

const inElectron = Boolean(process.versions.electron);
const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };

async function writeMemoryFile(root: string, relative: string): Promise<void> {
  const filePath = path.join(root, relative);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nid: ${path.basename(relative, '.md')}\n---\n\nThe zanzibar deploy uses pnpm.\n`);
}

describe.skipIf(!inElectron)('memory search index', () => {
  let seroHome = '';
  let workspace = '';

  beforeAll(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-qmd-'));
    workspace = path.join(seroHome, 'project');
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    const global = globalLocation().root;
    for (const file of ['entries/pinned/mem-pin00001.md', 'entries/on-match/mem-hit00001.md', 'entries/unsorted/mem-uns00001.md', 'trash/mem-del00001.md', 'daily/2026-04-01.md', 'sessions/2026-04-01-abcd.md']) {
      await writeMemoryFile(global, file);
    }
    await writeMemoryFile(workspaceLocation(workspace).root, 'entries/on-match/mem-wsh00001.md');
    await writeMemoryFile(workspaceLocation(workspace).root, 'entries/pinned/mem-wsp00001.md');
    await writeMemoryFile(workspaceLocation(workspace).root, 'scratchpad.md');
    expect(await warmUp(workspace)).toBe(true);
  });

  afterAll(async () => {
    await releaseIndex('test');
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  async function idsIn(collection: string): Promise<string[]> {
    const store = memoryRegistry().qmd.store!;
    const results = await store.searchLex('zanzibar', { collection, limit: 50 });
    return results.map((result) => path.basename(result.filepath, '.md')).sort();
  }

  it('searches only on-match entries for recall, per scope', async () => {
    expect(await idsIn(collectionsFor(globalLocation()).recall)).toEqual(['mem-hit00001']);
    expect(await idsIn(collectionsFor(workspaceLocation(workspace)).recall)).toEqual(['mem-wsh00001']);
  });

  it('checks every stored entry, and nothing else, for a close match', async () => {
    expect(await idsIn(collectionsFor(globalLocation()).all)).toEqual(['mem-hit00001', 'mem-pin00001', 'mem-uns00001']);
    expect(await idsIn(collectionsFor(workspaceLocation(workspace)).all)).toEqual(['mem-wsh00001', 'mem-wsp00001']);
  });
});
