import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The native index is not loaded in unit tests; search runs on keywords.
vi.mock('../qmd-index', async (importOriginal) => ({
  ...await importOriginal<typeof import('../qmd-index')>(),
  warmUp: vi.fn(async () => false),
  refreshIndex: vi.fn(async () => undefined),
}));

import { globalLocation, listEntries, readTrashedEntry, workspaceLocation, writeEntry } from '../entry-store';
import type { EntryContext, MemoryChange } from '../memory-entries';
import { getIdentityPath, getUserPath, resolveMemoryRoot } from '../memory-manager';
import { executeMemoryAction } from '../memory-tool';
import { resolveMetricsPath } from '../metrics';
import { memoryRegistry } from '../registry';

const originalEnv = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };

const pnpmMemory = {
  action: 'save' as const,
  content: 'JS/TS projects use pnpm.',
  behaviour: 'Run pnpm, never npm or yarn, to add or install packages.',
  type: 'preference' as const,
  scope: 'global' as const,
  delivery: 'on-match' as const,
  terms: 'pnpm, package manager, add dependency',
};

function idIn(result: string): string {
  const id = /\[(mem-[a-z0-9-]+)/.exec(result)?.[1];
  if (!id) throw new Error(`no id in: ${result}`);
  return id;
}

async function metricEvents(): Promise<Array<Record<string, unknown>>> {
  const content = await readFile(resolveMetricsPath(), 'utf8').catch(() => '');
  return content.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('memory tool', () => {
  let seroHome = '';
  let ctx: EntryContext;

  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-tool-'));
    process.env.SERO_HOME = seroHome;
    process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
    memoryRegistry().gitChecks.clear();
    ctx = { sessionId: 'session-1', workspaceRoot: path.join(seroHome, 'project'), recalled: new Set() };
    await mkdir(ctx.workspaceRoot);
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalEnv.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = originalEnv.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('reports each save, replace and remove for the chat line', async () => {
    const changes: MemoryChange[] = [];
    const tracked: EntryContext = { ...ctx, onChange: (change) => changes.push(change) };

    const id = idIn(await executeMemoryAction(tracked, pnpmMemory));
    await executeMemoryAction(tracked, { action: 'replace', id, content: 'JS/TS projects use bun.', behaviour: 'Run bun.' });
    await executeMemoryAction(tracked, { action: 'list' });
    await executeMemoryAction(tracked, { action: 'remove', id, reason: 'the user dropped bun' });

    expect(changes).toEqual([
      { action: 'save', id, fact: pnpmMemory.content },
      { action: 'replace', id, fact: 'JS/TS projects use bun.' },
      { action: 'remove', id, fact: 'JS/TS projects use bun.' },
    ]);
  });

  it('reports no change for a refused save', async () => {
    const changes: MemoryChange[] = [];
    await executeMemoryAction({ ...ctx, onChange: (change) => changes.push(change) }, { action: 'save', content: 'Use pnpm.' });
    expect(changes).toEqual([]);
  });

  it('rejects a save with missing fields and names them', async () => {
    const result = await executeMemoryAction(ctx, { action: 'save', content: 'Use pnpm.', type: 'preference', scope: 'global' });

    expect(result).toMatch(/^Error: memory not saved/);
    expect(result).toContain('behaviour');
    expect(result).toContain('delivery');
    expect(result).toContain('terms');
    expect(await listEntries(globalLocation(), 'on-match')).toEqual([]);
  });

  it('reports a close memory instead of saving, until replace or distinct', async () => {
    const firstId = idIn(await executeMemoryAction(ctx, pnpmMemory));

    const close = await executeMemoryAction(ctx, {
      ...pnpmMemory,
      content: 'Use pnpm for JS projects.',
      terms: 'pnpm, package manager',
    });
    expect(close).toMatch(/^Not saved/);
    expect(close).toContain(firstId);
    expect(await listEntries(globalLocation(), 'on-match')).toHaveLength(1);

    const distinct = await executeMemoryAction(ctx, { ...pnpmMemory, content: 'Use pnpm for JS projects.', distinct: true });
    expect(distinct).toMatch(/^Saved:/);
    expect(await listEntries(globalLocation(), 'on-match')).toHaveLength(2);
  });

  it('saves one entry when two sessions save the same fact at the same time', async () => {
    const other = { ...ctx, sessionId: 'session-2' };

    const results = await Promise.all([executeMemoryAction(ctx, pnpmMemory), executeMemoryAction(other, pnpmMemory)]);

    expect(results.filter((result) => result.startsWith('Saved:'))).toHaveLength(1);
    expect(await listEntries(globalLocation(), 'on-match')).toHaveLength(1);
  });

  it('refuses a pin at the cap and lists the pinned set', async () => {
    const pinned: string[] = [];
    for (let index = 0; index < 10; index++) {
      pinned.push(idIn(await executeMemoryAction(ctx, {
        ...pnpmMemory,
        content: `Rule number ${index}.`,
        terms: `rule${index}`,
        delivery: 'pinned',
      })));
    }
    const extra = idIn(await executeMemoryAction(ctx, { ...pnpmMemory, terms: 'yarn' }));

    const result = await executeMemoryAction(ctx, { action: 'pin', id: extra });

    expect(result).toMatch(/^Not pinned\. The global pinned set is full \(10\/10\)/);
    for (const id of pinned) expect(result).toContain(id);
    expect((await listEntries(globalLocation(), 'on-match')).map((entry) => entry.id)).toEqual([extra]);
  });

  it('keeps an unpinned memory as on-match', async () => {
    const id = idIn(await executeMemoryAction(ctx, { ...pnpmMemory, delivery: 'pinned' }));

    expect(await executeMemoryAction(ctx, { action: 'unpin', id })).toMatch(/^Unpinned/);

    expect(await listEntries(globalLocation(), 'pinned')).toEqual([]);
    expect((await listEntries(globalLocation(), 'on-match')).map((entry) => entry.id)).toEqual([id]);
  });

  it('restores a removed memory with the same content, scope and delivery', async () => {
    const id = idIn(await executeMemoryAction(ctx, { ...pnpmMemory, scope: 'workspace', delivery: 'pinned' }));
    const [before] = await listEntries(workspaceLocation(ctx.workspaceRoot), 'pinned');

    expect(await executeMemoryAction(ctx, { action: 'remove', id, reason: 'the user switched to npm' })).toMatch(/^Removed/);
    expect(await listEntries(workspaceLocation(ctx.workspaceRoot), 'pinned')).toEqual([]);

    expect(await executeMemoryAction(ctx, { action: 'restore', id })).toMatch(/^Restored/);
    expect(await listEntries(workspaceLocation(ctx.workspaceRoot), 'pinned')).toEqual([before]);
  });

  it('keeps a removed pinned memory in the trash when the pinned set is full', async () => {
    const workspace = workspaceLocation(ctx.workspaceRoot);
    const id = idIn(await executeMemoryAction(ctx, { ...pnpmMemory, scope: 'workspace', delivery: 'pinned' }));
    await executeMemoryAction(ctx, { action: 'remove', id, reason: 'r' });
    for (let index = 0; index < 5; index++) {
      await executeMemoryAction(ctx, { ...pnpmMemory, content: `Rule ${index}.`, terms: `rule${index}`, scope: 'workspace', delivery: 'pinned' });
    }

    expect(await executeMemoryAction(ctx, { action: 'restore', id })).toMatch(/^Not restored\. The workspace pinned set is full \(5\/5\)/);

    expect(await listEntries(workspace, 'pinned')).toHaveLength(5);
    expect(await readTrashedEntry(workspace, id)).not.toBeNull();
  });

  it('refuses to unpin an older memory that has no search terms', async () => {
    await writeEntry(globalLocation(), {
      id: 'mem-old00001', type: 'preference', scope: 'global', created: '2026-01-01', confirmed: '2026-01-01',
      replaces: [], terms: [], body: 'Prefers short answers.',
    }, 'unsorted');

    expect(await executeMemoryAction(ctx, { action: 'unpin', id: 'mem-old00001' })).toMatch(/^Not unpinned/);
    expect((await listEntries(globalLocation(), 'unsorted')).map((entry) => entry.id)).toEqual(['mem-old00001']);
  });

  it('fails a profile read that cannot read the file, instead of calling it empty', async () => {
    // A folder in place of USER.md makes the read fail with an error other than "not found".
    await mkdir(getUserPath(resolveMemoryRoot()), { recursive: true });

    await expect(executeMemoryAction(ctx, { action: 'read', target: 'user' })).rejects.toThrow();
  });

  it('writes and reads profiles without entry fields', async () => {
    const written = await executeMemoryAction(ctx, {
      action: 'write',
      target: 'identity',
      content: '# Identity\n\n- **Name:** Sero\n- **Style:** Direct & concise',
    });
    expect(written).toMatch(/^Wrote IDENTITY\.md/);
    expect(await readFile(getIdentityPath(resolveMemoryRoot()), 'utf8')).toContain('- **Style:** Direct & concise');

    await writeFile(getUserPath(resolveMemoryRoot()), '# User\n\n- **Name:** Sam\n');
    expect(await executeMemoryAction(ctx, { action: 'read', target: 'user' })).toBe('# User\n\n- **Name:** Sam');
  });

  it('records a miss when an on-match memory not recalled this session is replaced', async () => {
    const onMatch = idIn(await executeMemoryAction(ctx, pnpmMemory));
    const pinned = idIn(await executeMemoryAction(ctx, { ...pnpmMemory, terms: 'commits', content: 'Use conventional commits.', delivery: 'pinned' }));
    const recalled = idIn(await executeMemoryAction(ctx, { ...pnpmMemory, terms: 'tabs', content: 'Indent with tabs.' }));
    ctx = { ...ctx, recalled: new Set([recalled]) };

    for (const id of [onMatch, pinned, recalled]) {
      expect(await executeMemoryAction(ctx, { action: 'replace', id, content: 'Updated fact.', behaviour: 'Do the updated thing.' }))
        .toMatch(/^Saved:/);
    }

    const events = await metricEvents();
    expect(events.filter((event) => event.event === 'miss').map((event) => event.id)).toEqual([onMatch]);
    expect(events.filter((event) => event.event === 'pinned-break').map((event) => event.id)).toEqual([pinned]);
  });
});
