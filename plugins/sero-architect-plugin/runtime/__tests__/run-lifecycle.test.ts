/**
 * Run identity and shared activity (spec architect-run-observability).
 *
 * One run per objective; the identity survives retries, restarts and work that
 * outlives a Stop. An activity that serves two objectives is charged once and
 * linked from both.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectRecord, type ProjectRecord } from '../../shared/record';
import { activeRun } from '../../shared/runs';
import type { ArchitectIndex } from '../../shared/types';
import { createRecordStore } from '../record-store';
import { createRunJournal } from '../run-journal';
import {
  closeActiveRun,
  ensureInitialRun,
  openMaintenanceRun,
  recordSharedActivity,
} from '../run-lifecycle';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const T0 = '2026-09-14T09:12:00.000Z';
const T1 = '2026-09-14T12:19:00.000Z';
const T2 = '2026-09-15T08:02:00.000Z';
const T3 = '2026-09-15T09:26:00.000Z';

async function harness(initial?: Partial<ProjectRecord>) {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-lifecycle-'));
  dirs.push(homeDir);
  let index: ArchitectIndex | null = null;
  const store = createRecordStore({
    homeDir,
    indexFile: path.join(homeDir, 'state.json'),
    updateIndex: async (updater) => { index = updater(index); },
  });
  const journal = createRunJournal({ homeDir });
  const record: ProjectRecord = {
    ...createProjectRecord({ id: 'proj_1', name: 'Hollow Depths', idea: 'idea', folder: '~/p', now: T0 }),
    ...initial,
  };
  await store.write(record);
  return { homeDir, store, journal, deps: { store, journal } };
}

describe('run identity follows the objective', () => {
  it('opens one initial run and never a second one', async () => {
    const { store, deps } = await harness();
    const first = await ensureInitialRun(deps, 'proj_1', T0);
    expect(first).toBe('run-initial-proj_1');
    // Restart, or a re-entered discovery, keeps the same identity.
    const again = await ensureInitialRun(deps, 'proj_1', T1);
    expect(again).toBeNull();
    const record = await store.read('proj_1');
    expect(record?.runs?.filter((run) => run.kind === 'initial')).toHaveLength(1);
    expect(activeRun(record!)?.id).toBe('run-initial-proj_1');
  });

  it('covers several milestones with one maintenance run and keeps it across a restart', async () => {
    const { store, journal, deps } = await harness({ phase: 'maintain' });
    await ensureInitialRun(deps, 'proj_1', T0);
    await closeActiveRun(deps, 'proj_1', 'delivered', T1);

    const opened = await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T2, 'run-maint-12');
    expect(opened).toMatchObject({ runId: 'run-maint-12', reused: false });

    // Two milestones of the same objective do not open more runs.
    const second = await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T3, 'run-maint-12b');
    expect(second).toMatchObject({ runId: 'run-maint-12', reused: true });

    // A restart reads the same identity off the durable record.
    const reloaded = await store.read('proj_1');
    expect(reloaded?.runs?.map((run) => run.kind)).toEqual(['initial', 'maintenance']);
    expect(activeRun(reloaded!)?.id).toBe('run-maint-12');
    expect(await journal.readSummary('proj_1', 'run-maint-12')).toBeNull();
  });

  it('records a dismissed triage as no work needed, not a delivery', async () => {
    const { store, deps } = await harness({ phase: 'maintain' });
    await ensureInitialRun(deps, 'proj_1', T0);
    await closeActiveRun(deps, 'proj_1', 'delivered', T1);
    await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'ci-stale' }, T2, 'run-maint-ci');
    const closed = await closeActiveRun(deps, 'proj_1', 'no-work-needed', T2);
    expect(closed).toBe('run-maint-ci');

    const record = await store.read('proj_1');
    const run = record?.runs?.find((entry) => entry.id === 'run-maint-ci');
    expect(run).toMatchObject({ outcome: 'no-work-needed', endedAt: T2 });
    // Nothing claims this objective was delivered, and no run stays open.
    expect(record?.runs?.some((entry) => entry.outcome === 'delivered' && entry.id === 'run-maint-ci')).toBe(false);
    expect(activeRun(record!)).toBeUndefined();
  });

  it('opens its own run for a different objective and reuses the identity for a repeated cause', async () => {
    const { store, deps } = await harness({ phase: 'maintain' });
    await ensureInitialRun(deps, 'proj_1', T0);
    await closeActiveRun(deps, 'proj_1', 'delivered', T1);
    await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T2, 'run-maint-12');
    // A second objective arriving during triage keeps its own identity, so one
    // wake that serves both can be linked to both runs.
    const second = await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'ci-9' }, T2, 'run-maint-ci');
    expect(second).toMatchObject({ runId: 'run-maint-ci', reused: false });
    // A repeated cause of the same objective reuses its identity.
    const repeat = await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'ci-9' }, T2, 'run-maint-ci-again');
    expect(repeat).toMatchObject({ runId: 'run-maint-ci', reused: true });

    const record = await store.read('proj_1');
    expect(record?.runs?.map((run) => run.id)).toEqual(['run-initial-proj_1', 'run-maint-12', 'run-maint-ci']);
    expect(record?.runs?.filter((run) => run.endedAt === null)).toHaveLength(2);
  });

  it('links a later occurrence of one objective to its earlier run', async () => {
    const { store, deps } = await harness({ phase: 'maintain' });
    await ensureInitialRun(deps, 'proj_1', T0);
    await closeActiveRun(deps, 'proj_1', 'delivered', T1);
    await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T2, 'run-maint-12');
    await closeActiveRun(deps, 'proj_1', 'delivered', T2);
    const later = await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T3, 'run-maint-12b');
    expect(later).toMatchObject({ runId: 'run-maint-12b', reused: false, linkedFrom: 'run-maint-12' });
    expect((await store.read('proj_1'))?.runs?.find((run) => run.id === 'run-maint-12b')?.linkedRunIds).toEqual(['run-maint-12']);
  });

  it('keeps a stopped run open for late in-flight work and accepts nothing', async () => {
    const { store, deps } = await harness({ phase: 'maintain' });
    await ensureInitialRun(deps, 'proj_1', T0);
    await closeActiveRun(deps, 'proj_1', 'delivered', T1);
    await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T2, 'run-maint-12');
    const closed = await closeActiveRun(deps, 'proj_1', 'stopped', T3);
    expect(closed).toBe('run-maint-12');

    const record = await store.read('proj_1');
    const run = record?.runs?.find((entry) => entry.id === 'run-maint-12');
    expect(run).toMatchObject({ outcome: 'stopped', endedAt: T3 });
    // Late work is still attributed to the original run: the identity is stable.
    const late = await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T3, 'run-maint-12-late');
    expect(late.runId).toBe('run-maint-12-late');
    expect((await store.read('proj_1'))?.runs?.map((entry) => entry.id)).toEqual([
      'run-initial-proj_1', 'run-maint-12', 'run-maint-12-late',
    ]);
  });
});

describe('shared activity is linked, never guessed', () => {
  it('appears from both runs, is written once, and is charged once', async () => {
    const { store, journal, deps } = await harness({ phase: 'maintain' });
    await ensureInitialRun(deps, 'proj_1', T0);
    await closeActiveRun(deps, 'proj_1', 'delivered', T1);
    await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'issue-12' }, T2, 'run-maint-12');
    await openMaintenanceRun(deps, 'proj_1', { objectiveId: 'ci-9' }, T2, 'run-maint-ci');

    const result = await recordSharedActivity(deps, 'proj_1', {
      activityId: 'wake-2026-09-15T08:14',
      runIds: ['run-maint-12', 'run-maint-ci'],
      at: T2,
      costUsd: 0.058,
      note: 'One wake carried both objectives.',
    }, T2);
    expect(result.linkedRunIds).toEqual(['run-maint-12', 'run-maint-ci']);

    const record = await store.read('proj_1');
    expect(record?.runs?.find((run) => run.id === 'run-maint-12')?.sharedActivityIds).toEqual(['wake-2026-09-15T08:14']);
    expect(record?.runs?.find((run) => run.id === 'run-maint-ci')?.sharedActivityIds).toEqual(['wake-2026-09-15T08:14']);

    // Written to the shared journal exactly once, so lifetime totals charge it once.
    const shared = await journal.readPage('proj_1', 'shared');
    expect(shared.records.filter((entry) => entry.key === 'wake-2026-09-15T08:14')).toHaveLength(1);

    // A replayed record of the same activity links nothing new and appends nothing.
    const replay = await recordSharedActivity(deps, 'proj_1', { activityId: 'wake-2026-09-15T08:14', runIds: ['run-maint-12'], at: T2, costUsd: 0.058 }, T2);
    expect(replay.linkedRunIds).toEqual([]);
    expect((await journal.readPage('proj_1', 'shared')).records).toHaveLength(1);
  });

  it('keeps unassigned legacy usage visible instead of dropping or reassigning it', async () => {
    const { store, deps } = await harness({ phase: 'maintain' });
    // A project whose earlier spend predates run identity.
    await store.update('proj_1', (record) => ({
      ...record,
      budget: {
        ...record.budget,
        incomplete: true,
        incompleteSources: ['usage before run identity'],
        spentUsd: 3.16,
        sources: { owner: 3.16, research: 0, dispatched: 0 },
      },
    }));
    await ensureInitialRun(deps, 'proj_1', T0);
    const record = await store.read('proj_1');
    expect(record?.budget.spentUsd).toBe(3.16);
    expect(record?.budget.incompleteSources).toEqual(['usage before run identity']);
    // Opening a run never rewrites the spend that existed before it.
    expect(record?.runs?.[0]).toMatchObject({ kind: 'initial' });
    expect(record?.budget.sources.owner).toBe(3.16);
  });
});
