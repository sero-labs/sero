import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectRecord, type ProjectRecord } from '../../shared/record';
import { clearProjectTierOverride, effectiveTier, setProjectTierOverride } from '../../shared/model-config';
import { activeRun, closeRun, openRun } from '../../shared/runs';
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

const record = (id: string, stateLine = 'fresh', updatedAt = '2026-09-06T10:00:00.000Z'): ProjectRecord => ({
  ...createProjectRecord({ id, name: id, idea: 'idea', folder: '~/p', now: '2026-09-06T10:00:00.000Z' }),
  stateLine,
  updatedAt,
});

describe('record store', () => {
  it('writes the record and its index row in one operation', async () => {
    const { store, homeDir, index, updateIndex } = await harness();
    await store.write(record('a', 'one'));

    expect(await store.read('a')).toMatchObject({ id: 'a', stateLine: 'one' });
    expect(index()?.projects).toEqual([expect.objectContaining({ id: 'a', phase: 'intake', needsYou: 0 })]);
    // The owner's own sentence stays on the record; the index carries the derived state.
    expect(index()?.projects[0]).not.toHaveProperty('stateLine');
    expect(updateIndex).toHaveBeenCalledTimes(1);
    // No temp file survives a successful write.
    expect(await readdir(path.join(homeDir, 'projects'))).toEqual(['a.json']);

    await store.write(record('a', 'two', '2026-09-06T11:00:00.000Z'));
    expect(index()?.projects).toHaveLength(1);
    expect(index()?.projects[0].updatedAt).toBe('2026-09-06T11:00:00.000Z');
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

    await expect(store.write(record('a', 'partial', '2026-09-06T12:00:00.000Z'))).rejects.toThrow('power cut');

    expect(await store.read('a')).toMatchObject({ stateLine: 'complete' });
    expect(JSON.parse(await readFile(path.join(homeDir, 'projects', 'a.json'), 'utf8')).stateLine).toBe('complete');
    expect(await readdir(path.join(homeDir, 'projects'))).toEqual(['a.json']);
    expect(index()?.projects[0].updatedAt).toBe('2026-09-06T10:00:00.000Z');
    expect(updateIndex).toHaveBeenCalledTimes(1);
  });

  it('returns a durable mutation as successful when the derived index write fails', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-store-'));
    dirs.push(homeDir);
    let fail = true;
    let index: ArchitectIndex | null = null;
    const indexEntries = (): ArchitectIndex['projects'] => index?.projects ?? [];
    const store = createRecordStore({
      homeDir,
      indexFile: path.join(homeDir, 'state.json'),
      updateIndex: async (updater) => {
        if (fail) throw new Error('index unavailable');
        index = updater(index);
      },
    });

    await expect(store.write(record('a', 'durable'))).resolves.toBeUndefined();
    expect((await store.read('a'))?.stateLine).toBe('durable');
    fail = false;
    await store.write(record('b'));
    expect(indexEntries().map((project) => project.id).sort()).toEqual(['a', 'b']);
  });

  it('rebuilds a dirty index before a later removal can mark it clean', async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-store-'));
    dirs.push(homeDir);
    let fail = false;
    let index: ArchitectIndex | null = null;
    const indexEntries = (): ArchitectIndex['projects'] => index?.projects ?? [];
    const store = createRecordStore({
      homeDir,
      indexFile: path.join(homeDir, 'state.json'),
      updateIndex: async (updater) => {
        if (fail) throw new Error('index unavailable');
        index = updater(index);
      },
    });

    await store.write(record('b'));
    fail = true;
    await store.write(record('a'));
    fail = false;
    await store.remove('b');

    expect(indexEntries().map((project) => project.id)).toEqual(['a']);
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

  it('keeps a write made while a slow update is in flight', async () => {
    const { store } = await harness();
    await store.write(record('a'));
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    // A wake that reads, waits on something slow, then writes.
    const slow = store.update('a', async (current) => {
      await held;
      return { ...current, stateLine: 'the slow wake finished' };
    });
    // The user sends a directive while that wake is still in flight.
    const directive = store.update('a', (current) => ({
      ...current,
      directives: [...current.directives, { id: 'dir_1', text: 'stop gold-plating', sentAt: '2026-09-07T10:00:00.000Z', reply: null }],
    }));
    release();
    await Promise.all([slow, directive]);
    const final = await store.read('a');
    expect(final?.stateLine).toBe('the slow wake finished');
    expect(final?.directives.map((d) => d.id)).toEqual(['dir_1']);
  });

  it('changes what is on disk, not the stale copy the caller holds', async () => {
    const { store } = await harness();
    const stale = record('a');
    await store.write(stale);
    await store.write({ ...stale, brief: 'written by another wake' });
    const written = await store.update('a', (current) => ({ ...current, stateLine: 'written by this wake' }));
    expect(written?.brief).toBe('written by another wake');
    expect((await store.read('a'))?.brief).toBe('written by another wake');
    expect((await store.read('a'))?.stateLine).toBe('written by this wake');
  });

  it('leaves the record alone when the mutator declines or the project is gone', async () => {
    const { store } = await harness();
    await store.write(record('a', 'untouched'));
    expect(await store.update('a', () => null)).toBeNull();
    expect((await store.read('a'))?.stateLine).toBe('untouched');
    expect(await store.update('missing', (current) => current)).toBeNull();
  });
});

/** Budget totals an older runtime recorded, kept verbatim so nothing is rewritten. */
const LEGACY_BUDGET = {
  capUsd: 25,
  spentUsd: 6.1,
  incomplete: false,
  sources: { owner: 1.12, research: 2.48, dispatched: 2.5 },
};

describe('legacy records, project overrides and run references', () => {
  it('reads a record an older runtime wrote, with its budget amounts unchanged', async () => {
    const { store, homeDir } = await harness();
    // Exactly the bytes an older runtime wrote: no runs, no overrides, no revision.
    const legacy = { ...record('legacy'), budget: LEGACY_BUDGET };
    await store.write(legacy);
    const raw = JSON.parse(await readFile(path.join(homeDir, 'projects', 'legacy.json'), 'utf8'));
    expect(raw).not.toHaveProperty('runs');
    expect(raw).not.toHaveProperty('modelOverrides');
    expect(raw).not.toHaveProperty('modelConfigRevision');

    const read = await store.read('legacy');
    expect(read).not.toBeNull();
    expect(read?.runs).toBeUndefined();
    expect(read?.modelOverrides).toBeUndefined();
    expect(read?.modelConfigRevision).toBeUndefined();
    expect(read?.budget).toEqual(LEGACY_BUDGET);
  });

  it('keeps overrides and runs in the record, out of the index, with budget untouched', async () => {
    const { store, index } = await harness();
    await store.write({ ...record('a'), budget: LEGACY_BUDGET });
    const updated = await store.update('a', (current) => {
      const withOverride = setProjectTierOverride(current, 'MED', {
        provider: 'openai', modelId: 'gpt-5-codex', thinkingLevel: 'medium',
      });
      const opened = openRun(withOverride, { id: 'run-initial', kind: 'initial' }, '2026-09-14T09:12:00.000Z');
      if (!opened.ok) throw new Error(opened.error);
      return opened.record;
    });
    expect(updated).not.toBeNull();

    const read = await store.read('a');
    expect(read?.modelOverrides?.MED?.modelId).toBe('gpt-5-codex');
    expect(read?.modelConfigRevision).toBe(1);
    expect(read?.runs?.map((run) => run.id)).toEqual(['run-initial']);
    expect(read?.budget).toEqual(LEGACY_BUDGET);

    // The hot index row stays compact: no detailed telemetry, and the same spend.
    const row = index()?.projects[0];
    expect(row).toBeDefined();
    expect(Object.keys(row ?? {})).not.toContain('runs');
    expect(row).not.toHaveProperty('modelOverrides');
    expect(row?.spentUsd).toBe(LEGACY_BUDGET.spentUsd);
  });

  it('restores global inheritance when a project override is cleared', async () => {
    const { store } = await harness();
    const base: ProjectRecord = {
      ...record('a'),
      modelTiers: {
        LOW: { provider: 'anthropic', modelId: 'haiku', thinkingLevel: 'low' },
        MED: { provider: 'anthropic', modelId: 'sonnet', thinkingLevel: 'medium' },
      },
    };
    await store.write(base);
    await store.update('a', (current) => setProjectTierOverride(current, 'MED', { provider: 'openai', modelId: 'gpt-5-codex' }));
    const overridden = await store.read('a');
    expect(overridden && effectiveTier(overridden, 'MED')).toMatchObject({
      source: 'project-override', entry: { modelId: 'gpt-5-codex' },
    });
    // LOW was never overridden and keeps resolving from the global selection.
    expect(overridden && effectiveTier(overridden, 'LOW')).toMatchObject({ source: 'inherited-global' });

    await store.update('a', (current) => clearProjectTierOverride(current, 'MED'));
    const inherited = await store.read('a');
    expect(inherited && effectiveTier(inherited, 'MED')).toMatchObject({
      source: 'inherited-global', entry: { modelId: 'sonnet' },
    });
    expect(inherited?.modelConfigRevision).toBe(2);
  });

  it('keeps a concurrent override save and run open from losing each other', async () => {
    const { store } = await harness();
    await store.write({ ...record('a'), modelTiers: { MED: { provider: 'anthropic', modelId: 'sonnet' } } });
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    // The runtime opens the initial run before its first observable work.
    const opening = store.update('a', async (current) => {
      await held;
      const opened = openRun(current, { id: 'run-initial', kind: 'initial' }, '2026-09-14T09:12:00.000Z');
      if (!opened.ok) throw new Error(opened.error);
      return opened.record;
    });
    // The user saves a model default while that open is still in flight.
    const saving = store.update('a', (current) => setProjectTierOverride(current, 'MED', { provider: 'openai', modelId: 'gpt-5-codex' }));
    release();
    await Promise.all([opening, saving]);

    const final = await store.read('a');
    expect(final?.runs?.map((run) => run.id)).toEqual(['run-initial']);
    expect(final?.modelOverrides?.MED?.modelId).toBe('gpt-5-codex');
    expect(final?.modelConfigRevision).toBe(1);
  });

  it('refuses a duplicate initial run and a duplicate id, and keeps identity across a close', async () => {
    const { store } = await harness();
    await store.write(record('a'));
    await store.update('a', (current) => {
      const opened = openRun(current, { id: 'run-initial', kind: 'initial' }, '2026-09-14T09:12:00.000Z');
      if (!opened.ok) throw new Error(opened.error);
      return opened.record;
    });
    // A project has exactly one initial run, and a run id is never reused.
    await store.update('a', (current) => {
      expect(openRun(current, { id: 'run-initial-2', kind: 'initial' }, '2026-09-14T09:30:00.000Z').ok).toBe(false);
      expect(openRun(current, { id: 'run-initial', kind: 'maintenance', objectiveId: 'x' }, '2026-09-14T09:30:00.000Z').ok).toBe(false);
      return null;
    });

    await store.update('a', (current) => closeRun(current, 'run-initial', 'delivered', '2026-09-14T12:19:00.000Z'));
    const closed = await store.read('a');
    expect(closed && activeRun(closed)).toBeUndefined();
    expect(closed?.runs?.[0]).toMatchObject({ id: 'run-initial', outcome: 'delivered', endedAt: '2026-09-14T12:19:00.000Z' });

    // Two maintenance objectives can be in flight at once, each with its own run.
    await store.update('a', (current) => {
      const first = openRun(current, { id: 'run-maint', kind: 'maintenance', objectiveId: 'issue-12' }, '2026-09-15T08:02:00.000Z');
      if (!first.ok) throw new Error(first.error);
      const second = openRun(first.record, { id: 'run-maint-ci', kind: 'maintenance', objectiveId: 'ci-9' }, '2026-09-15T08:03:00.000Z');
      if (!second.ok) throw new Error(second.error);
      return second.record;
    });
    const running = await store.read('a');
    expect(running?.runs?.map((run) => run.kind)).toEqual(['initial', 'maintenance', 'maintenance']);
    expect(running?.runs?.filter((run) => run.endedAt === null)).toHaveLength(2);
  });
});
