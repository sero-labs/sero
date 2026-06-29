import { describe, expect, it } from 'vitest';
import { handleLibraryAction } from '../library-actions';
import { emptyPlan } from '../loop-factory';
import { DEFAULT_LOG_POLICY } from '../../shared/defaults';
import type { LibraryEntry, LibraryVersion } from '../../shared/types';
import { createFakeHost } from './fake-host';
import { seedActiveLoop } from './fixtures';
import { oneStepPlan } from './fixtures';

describe('library_save', () => {
  it('saves an unlinked loop as a new entry at v1 and links it', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);

    const res = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });

    expect(res.ok).toBe(true);
    expect(res.loop?.libraryLink).toMatchObject({ version: 1 });

    const index = await host.library.readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({ name: 'Seeded', latestVersion: 1, versionCount: 1 });

    const entryId = res.loop!.libraryLink!.entryId;
    const v1 = await host.library.readVersion(entryId, 1);
    expect(v1?.definition.plan.steps).toHaveLength(1);
    expect(v1?.savedFromWorkspaceId).toBe(host.workspaceId);
  });

  it('bumps the linked entry to a new version on new-version save', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });

    const res = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-version', note: 'tweaked' });

    expect(res.loop?.libraryLink?.version).toBe(2);
    const index = await host.library.readIndex();
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]).toMatchObject({ latestVersion: 2, versionCount: 2 });
    expect((await host.library.readVersion(res.loop!.libraryLink!.entryId, 2))?.note).toBe('tweaked');
  });

  it('save-as-new-entry leaves the original entry untouched', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });
    const originalEntryId = first.loop!.libraryLink!.entryId;

    const res = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry', name: 'Copy' });

    const index = await host.library.readIndex();
    expect(index.entries).toHaveLength(2);
    expect(res.loop!.libraryLink!.entryId).not.toBe(originalEntryId);
    expect(index.entries.find((e) => e.id === originalEntryId)?.latestVersion).toBe(1);
    expect(index.entries.find((e) => e.id === res.loop!.libraryLink!.entryId)?.name).toBe('Copy');
  });

  it('new-version on a loop whose source entry was deleted starts a fresh entry', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const first = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });
    await host.library.deleteEntry(first.loop!.libraryLink!.entryId);

    const res = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-version' });

    expect(res.ok).toBe(true);
    expect(res.loop?.libraryLink?.version).toBe(1);
    expect(res.loop!.libraryLink!.entryId).not.toBe(first.loop!.libraryLink!.entryId);
  });

  it('refuses to save a loop with no plan', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, emptyPlan());
    const res = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });
    expect(res.ok).toBe(false);
    expect(await host.library.readIndex()).toMatchObject({ entries: [] });
  });

  it('errors for an unknown loop', async () => {
    const host = createFakeHost();
    const res = await handleLibraryAction(host, { kind: 'library_save', loopId: 'nope', mode: 'new-entry' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not found');
  });
});

describe('library_load', () => {
  async function savedEntry(host = createFakeHost()) {
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const saved = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });
    return { host, loop, entryId: saved.loop!.libraryLink!.entryId };
  }

  it('instantiates a fresh linked draft and appends it', async () => {
    const { host, loop, entryId } = await savedEntry();

    const res = await handleLibraryAction(host, { kind: 'library_load', entryId });

    expect(res.ok).toBe(true);
    expect(res.loop!.id).not.toBe(loop.id);
    expect(res.loop!.status).toBe('draft');
    expect(res.loop!.libraryLink).toMatchObject({ entryId, version: 1 });
    expect(res.loop!.plan.steps).toHaveLength(1);
    expect(res.loop!.runs).toEqual([]);
    expect(host.state.loops).toHaveLength(2);
  });

  it('loads the latest version by default and a specific version on request', async () => {
    const { host, loop, entryId } = await savedEntry();
    // Bump to v2 with a changed objective.
    await host.updateState((s) => ({
      ...s,
      loops: s.loops.map((l) => (l.id === loop.id ? { ...l, plan: { ...l.plan, objective: 'v2 objective' } } : l)),
    }));
    await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-version' });

    const latest = await handleLibraryAction(host, { kind: 'library_load', entryId });
    expect(latest.loop!.libraryLink!.version).toBe(2);
    expect(latest.loop!.plan.objective).toBe('v2 objective');

    const v1 = await handleLibraryAction(host, { kind: 'library_load', entryId, version: 1 });
    expect(v1.loop!.libraryLink!.version).toBe(1);
    expect(v1.loop!.plan.objective).toBe('Do one thing');
  });

  it('loads an invalid saved plan as a blocked draft', async () => {
    const host = createFakeHost();
    const entry: LibraryEntry = { id: 'entry_bad', name: 'Bad', summary: '', latestVersion: 1, createdAt: 't', updatedAt: 't' };
    const version: LibraryVersion = {
      version: 1,
      createdAt: 't',
      definition: {
        schemaVersion: 1,
        prompt: 'p',
        title: 'Bad',
        summary: '',
        plan: { schemaVersion: 1, revision: 0, objective: '', steps: [] },
        triggers: [],
        limits: {},
        logPolicy: DEFAULT_LOG_POLICY,
      },
    };
    await host.library.putVersion(entry, version);

    const res = await handleLibraryAction(host, { kind: 'library_load', entryId: 'entry_bad' });

    expect(res.ok).toBe(true);
    expect(res.loop!.runtime.block?.kind).toBe('validation-error');
  });

  it('errors for an unknown entry or version', async () => {
    const { host, entryId } = await savedEntry();
    expect((await handleLibraryAction(host, { kind: 'library_load', entryId: 'nope' })).ok).toBe(false);
    expect((await handleLibraryAction(host, { kind: 'library_load', entryId, version: 99 })).ok).toBe(false);
  });
});

describe('library_list', () => {
  it('returns the resolved library dir and the current index', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });

    const res = await handleLibraryAction(host, { kind: 'library_list' });

    expect(res.ok).toBe(true);
    expect(res.libraryDir).toBe('/library');
    expect(res.libraryIndex?.entries).toHaveLength(1);
  });
});

describe('library_set_version', () => {
  /** A linked loop sitting on v2, with a local step-model override recorded. */
  async function linkedAtV2() {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan); // step 'step-1', no model
    const saved = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });
    const entryId = saved.loop!.libraryLink!.entryId;
    // Change the plan and save v2 so there are two versions to switch between.
    await host.updateState((s) => ({
      ...s,
      loops: s.loops.map((l) => (l.id === loop.id ? { ...l, plan: { ...l.plan, objective: 'v2 objective' } } : l)),
    }));
    await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-version' });
    // Record a local model override (as set_step_model would on a linked loop).
    await host.updateState((s) => ({
      ...s,
      loops: s.loops.map((l) => (l.id === loop.id ? { ...l, stepOverrides: { 'step-1': { model: 'HIGH' } } } : l)),
    }));
    return { host, loopId: loop.id, entryId };
  }

  it('downgrades to an older version and replays the local override', async () => {
    const { host, loopId } = await linkedAtV2();

    const res = await handleLibraryAction(host, { kind: 'library_set_version', loopId, version: 1 });

    expect(res.ok).toBe(true);
    expect(res.loop!.libraryLink!.version).toBe(1);
    expect(res.loop!.plan.objective).toBe('Do one thing'); // v1's plan
    expect(res.loop!.plan.steps.find((s) => s.id === 'step-1')!.execution).toMatchObject({ model: 'HIGH' });
  });

  it('refuses to switch mid-run', async () => {
    const { host, loopId } = await linkedAtV2();
    await host.updateState((s) => ({
      ...s,
      loops: s.loops.map((l) => (l.id === loopId ? { ...l, runtime: { ...l.runtime, activeRunId: 'run_x' } } : l)),
    }));
    const res = await handleLibraryAction(host, { kind: 'library_set_version', loopId, version: 1 });
    expect(res.ok).toBe(false);
  });

  it('errors for an unlinked loop or an unknown version', async () => {
    const host = createFakeHost();
    const standalone = seedActiveLoop(host, oneStepPlan().plan);
    expect((await handleLibraryAction(host, { kind: 'library_set_version', loopId: standalone.id, version: 1 })).ok).toBe(false);

    const { host: h2, loopId } = await linkedAtV2();
    expect((await handleLibraryAction(h2, { kind: 'library_set_version', loopId, version: 99 })).ok).toBe(false);
  });
});

describe('library_unlink', () => {
  it('detaches the loop but keeps its plan', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });

    const res = await handleLibraryAction(host, { kind: 'library_unlink', loopId: loop.id });

    expect(res.ok).toBe(true);
    expect(res.loop!.libraryLink).toBeUndefined();
    expect(res.loop!.stepOverrides).toBeUndefined();
    expect(res.loop!.plan.steps).toHaveLength(1);
  });
});

describe('library_delete', () => {
  it('removes the entry without touching loaded loops', async () => {
    const host = createFakeHost();
    const loop = seedActiveLoop(host, oneStepPlan().plan);
    const saved = await handleLibraryAction(host, { kind: 'library_save', loopId: loop.id, mode: 'new-entry' });
    const entryId = saved.loop!.libraryLink!.entryId;

    const res = await handleLibraryAction(host, { kind: 'library_delete', entryId });

    expect(res.ok).toBe(true);
    expect((await host.library.readIndex()).entries).toHaveLength(0);
    // The loaded loop is untouched (still linked, plan intact).
    expect(host.state.loops[0].libraryLink?.entryId).toBe(entryId);
  });
});
