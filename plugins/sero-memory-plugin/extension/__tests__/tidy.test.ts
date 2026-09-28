import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Api, Model } from '@earendil-works/pi-ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../qmd-index', async (importOriginal) => ({
  ...await importOriginal<typeof import('../qmd-index')>(),
  refreshIndex: vi.fn(async () => undefined),
}));

const order: string[] = [];
vi.mock('../entry-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../entry-store')>();
  return {
    ...actual,
    writeEntry: async (...args: Parameters<typeof actual.writeEntry>) => {
      const stored = await actual.writeEntry(...args);
      order.push(`write ${stored.id}`);
      return stored;
    },
    trashEntry: async (...args: Parameters<typeof actual.trashEntry>) => {
      order.push(`trash ${args[1].id}`);
      return actual.trashEntry(...args);
    },
  };
});

import { conversionPaths } from '../conversion';
import type { MemoryEntry } from '../entry-format';
import {
  findEntry,
  globalLocation,
  listAllEntries,
  listEntries,
  readTrashedEntry,
  workspaceLocation,
  writeEntry,
  type ScopeLocation,
} from '../entry-store';
import { memoryRegistry } from '../registry';
import { keywordScore } from '../search-score';
import { runTidyIfDue, tidyLogPath, type TidyDeps } from '../tidy';

const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
const MODEL = { id: 'stub' } as unknown as Model<Api>;

function entry(id: string, body: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id,
    type: 'reference',
    scope: 'workspace',
    created: '2026-09-01',
    confirmed: '2026-09-01',
    replaces: [],
    terms: ['config'],
    body,
    ...overrides,
  };
}

function plan(...decisions: unknown[]): string {
  return JSON.stringify({ decisions });
}

describe('tidy-up', () => {
  let seroHome = '';
  let workspace = '';
  let ws: ScopeLocation;

  const deps = (complete: TidyDeps['complete'], now = new Date('2026-09-27T12:00:00Z')): TidyDeps => ({
    workspaceRoot: workspace,
    model: MODEL,
    complete,
    now,
  });

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-tidy-'));
    workspace = path.join(seroHome, 'project');
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await writeFile(path.join(workspace, 'src', 'present.ts'), 'export {};\n');
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    memoryRegistry().gitChecks.clear();
    ws = workspaceLocation(workspace);
    order.length = 0;
    await mkdir(path.dirname(conversionPaths.marker()), { recursive: true });
    await writeFile(conversionPaths.marker(), 'done');
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('drops a removal without evidence and logs the rejected proposal', async () => {
    await writeEntry(ws, entry('mem-keep0001', 'The build uses Vite.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => plan({ action: 'remove', id: 'mem-keep0001', reason: 'looks outdated' })));

    expect(await findEntry([ws], 'mem-keep0001')).not.toBeNull();
    expect(await readFile(tidyLogPath(), 'utf8')).toContain('"decision":"rejected"');
  });

  it('drops command, package and outside-workspace path evidence', async () => {
    await writeEntry(ws, entry('mem-cmd00001', 'Run pnpm build before release.'), 'on-match');
    await writeEntry(ws, entry('mem-pkg00001', 'Use @acme/ui for buttons.'), 'on-match');
    await writeEntry(ws, entry('mem-out00001', 'Shared config lives in ../other/config.ts.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => plan(
      { action: 'remove', id: 'mem-cmd00001', missingPath: 'pnpm', reason: 'r' },
      { action: 'remove', id: 'mem-pkg00001', missingPath: '@acme/ui', reason: 'r' },
      { action: 'remove', id: 'mem-out00001', missingPath: '../other/config.ts', reason: 'r' },
    )));

    expect((await listEntries(ws, 'on-match')).map((item) => item.id).sort())
      .toEqual(['mem-cmd00001', 'mem-out00001', 'mem-pkg00001']);
    const log = await readFile(tidyLogPath(), 'utf8');
    expect(log.match(/the evidence is not a file path inside the workspace/g)).toHaveLength(3);
  });

  it('removes a workspace entry whose named file is missing, and only that one', async () => {
    await writeEntry(ws, entry('mem-gone0001', 'Settings are read from src/old-config.ts.'), 'on-match');
    await writeEntry(ws, entry('mem-here0001', 'Exports live in src/present.ts.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => plan(
      { action: 'remove', id: 'mem-gone0001', missingPath: 'src/old-config.ts', reason: 'file deleted' },
      { action: 'remove', id: 'mem-here0001', missingPath: 'src/present.ts', reason: 'wrong' },
    )));

    expect((await listEntries(ws, 'on-match')).map((item) => item.id)).toEqual(['mem-here0001']);
    expect((await readTrashedEntry(ws, 'mem-gone0001'))?.evidence).toContain('src/old-config.ts does not exist');
  });

  it('keeps a workspace entry whose missing file is behind a link to outside the workspace', async () => {
    const outside = path.join(seroHome, 'outside');
    await mkdir(outside);
    await symlink(outside, path.join(workspace, 'src', 'linked'));
    await writeEntry(ws, entry('mem-link0001', 'Settings are read from src/linked/config.ts.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => plan({ action: 'remove', id: 'mem-link0001', missingPath: 'src/linked/config.ts', reason: 'missing' })));

    expect(await findEntry([ws], 'mem-link0001')).not.toBeNull();
  });

  it('keeps a workspace entry whose named file is a broken link', async () => {
    await symlink(path.join(seroHome, 'nowhere.ts'), path.join(workspace, 'src', 'dangling.ts'));
    await writeEntry(ws, entry('mem-dang0001', 'Settings are read from src/dangling.ts.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => plan({ action: 'remove', id: 'mem-dang0001', missingPath: 'src/dangling.ts', reason: 'missing' })));

    expect(await findEntry([ws], 'mem-dang0001')).not.toBeNull();
  });

  it('keeps a global entry that names a missing file', async () => {
    const global = globalLocation();
    await writeEntry(global, entry('mem-glob0001', 'Settings are read from src/config.ts.', { scope: 'global' }), 'on-match');

    await runTidyIfDue(global, deps(async () => plan({ action: 'remove', id: 'mem-glob0001', missingPath: 'src/config.ts', reason: 'missing' })));

    expect(await findEntry([global], 'mem-glob0001')).not.toBeNull();
  });

  it('does not change an entry that was replaced while the model call was pending', async () => {
    await writeEntry(ws, entry('mem-edit0001', 'Settings are read from src/old-config.ts.'), 'on-match');
    await writeEntry(ws, entry('mem-dupe0001', 'Settings come from src/old-config.ts.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => {
      await writeEntry(ws, entry('mem-edit0001', 'Settings are read from src/settings.ts.'), 'on-match');
      return plan({
        action: 'merge',
        ids: ['mem-edit0001', 'mem-dupe0001'],
        merged: { type: 'reference', body: 'Settings are read from src/old-config.ts.', terms: ['config'], delivery: 'on-match' },
        reason: 'duplicates',
      });
    }));

    expect((await findEntry([ws], 'mem-edit0001'))?.body).toBe('Settings are read from src/settings.ts.');
    expect(await listAllEntries(ws)).toHaveLength(2);
    expect(await readFile(tidyLogPath(), 'utf8')).toContain('mem-edit0001 changed during the tidy-up');
  });

  it('writes the merged entry before the originals move to trash', async () => {
    await writeEntry(ws, entry('mem-aaaa0001', 'Use pnpm.'), 'on-match');
    await writeEntry(ws, entry('mem-bbbb0001', 'Always use pnpm, not npm.'), 'on-match');
    order.length = 0;

    await runTidyIfDue(ws, deps(async () => plan({
      action: 'merge',
      ids: ['mem-aaaa0001', 'mem-bbbb0001'],
      merged: { type: 'preference', body: 'Use pnpm, never npm.', terms: ['pnpm'], delivery: 'on-match' },
      reason: 'same fact',
    })));

    const [merged] = await listEntries(ws, 'on-match');
    expect(merged?.replaces).toEqual(['mem-aaaa0001', 'mem-bbbb0001']);
    expect(order).toEqual([`write ${merged!.id}`, 'trash mem-aaaa0001', 'trash mem-bbbb0001']);
  });

  it('keeps originals when a merge has no usable search terms', async () => {
    await writeEntry(ws, entry('mem-aaaa0001', 'Use pnpm.'), 'on-match');
    await writeEntry(ws, entry('mem-bbbb0001', 'Always use pnpm, not npm.'), 'on-match');

    await runTidyIfDue(ws, deps(async () => plan({
      action: 'merge',
      ids: ['mem-aaaa0001', 'mem-bbbb0001'],
      merged: { type: 'preference', body: 'Use pnpm, never npm.', terms: [], delivery: 'on-match' },
      reason: 'same fact',
    })));

    expect((await listAllEntries(ws)).map((item) => item.id).sort()).toEqual(['mem-aaaa0001', 'mem-bbbb0001']);
    expect(await readTrashedEntry(ws, 'mem-aaaa0001')).toBeNull();
  });

  it('changes nothing when the output is not valid', async () => {
    const global = globalLocation();
    await writeEntry(global, entry('mem-unso0001', 'Prefer tabs.', { scope: 'global', terms: [] }), 'unsorted');

    expect(await runTidyIfDue(global, deps(async () => 'I think these look fine!'))).toBe('failed');

    expect((await listEntries(global, 'unsorted')).map((item) => item.id)).toEqual(['mem-unso0001']);
  });

  it('keeps an on-match entry unused for 60 days and asks the model to re-check it', async () => {
    await writeEntry(ws, entry('mem-old00001', 'The staging port is 4173.', { created: '2026-05-01' }), 'on-match');
    let prompt = '';

    await runTidyIfDue(ws, deps(async (request) => {
      prompt = request.prompt;
      return plan({ action: 'recheck', id: 'mem-old00001', reason: 'still valid' });
    }));

    expect(prompt).toContain('"recheck": true');
    expect(await findEntry([ws], 'mem-old00001')).not.toBeNull();
  });

  it('never runs twice at the same time for a scope', async () => {
    await writeEntry(ws, entry('mem-once0001', 'Use pnpm.'), 'on-match');
    let release: () => void = () => undefined;
    const calls = vi.fn(() => new Promise<string>((resolve) => {
      release = () => resolve(plan({ action: 'keep', id: 'mem-once0001', reason: 'fine' }));
    }));

    const first = runTidyIfDue(ws, deps(calls));
    await vi.waitFor(() => expect(calls).toHaveBeenCalledOnce());
    const second = await runTidyIfDue(ws, deps(calls));
    release();

    expect(second).toBe('busy');
    expect(await first).toBe('ran');
    expect(calls).toHaveBeenCalledOnce();
    // The finished run is recorded, so the next session does not repeat it.
    expect(await runTidyIfDue(ws, deps(calls))).toBe('not-due');
  });

  it('sorts unsorted entries within the pinned cap', async () => {
    const global = globalLocation();
    await writeFile(path.join(path.dirname(conversionPaths.marker()), 'config.json'), JSON.stringify({ pinnedGlobalCap: 1 }));
    await writeEntry(global, entry('mem-sort0001', 'Prefer tabs.', { scope: 'global', terms: [] }), 'unsorted');
    await writeEntry(global, entry('mem-sort0002', 'Answer in British English.', { scope: 'global', terms: [] }), 'unsorted');

    await runTidyIfDue(global, deps(async () => plan(
      { action: 'sort', id: 'mem-sort0001', delivery: 'pinned', terms: ['tabs'], reason: 'applies to most tasks' },
      { action: 'sort', id: 'mem-sort0002', delivery: 'pinned', terms: ['British English'], reason: 'applies to most tasks' },
    )));

    expect((await listEntries(global, 'pinned')).map((item) => item.id)).toEqual(['mem-sort0001']);
    const [onMatch] = await listEntries(global, 'on-match');
    expect(onMatch?.id).toBe('mem-sort0002');
    expect(keywordScore(onMatch?.terms ?? [], 'Answer in British English')).toBeGreaterThan(0);
    expect(await listEntries(global, 'unsorted')).toEqual([]);
  });

  it('keeps unsorted entries when sorting has no search terms', async () => {
    const global = globalLocation();
    await writeEntry(global, entry('mem-sort0001', 'Prefer tabs.', { scope: 'global', terms: [] }), 'unsorted');

    await runTidyIfDue(global, deps(async () => plan(
      { action: 'sort', id: 'mem-sort0001', delivery: 'on-match', reason: 'applies to some tasks' },
    )));

    expect((await listEntries(global, 'unsorted')).map((item) => item.id)).toEqual(['mem-sort0001']);
    expect(await listEntries(global, 'on-match')).toEqual([]);
  });
});
