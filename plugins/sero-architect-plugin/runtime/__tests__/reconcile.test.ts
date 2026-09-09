import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ProjectRecord } from '../../shared/record';
import type { ArchitectHost } from '../host';
import { ArchitectRuntime } from '../index';
import { createRecordStore } from '../record-store';
import { orchestratorIndexFiles } from '../dispatch-watch';
import { buildingProject, cleanupHosts, fakeHost, milestone, T0, type FakeHost } from './helpers';

afterEach(cleanupHosts);

/** Writes a record straight to disk the way a previous run would have left it. */
async function seed(host: ArchitectHost, record: ProjectRecord): Promise<void> {
  const store = createRecordStore({ homeDir: await host.homeDir(), indexFile: host.indexFile, updateIndex: async () => {} });
  await store.write(record);
}

const overBudget = (): ProjectRecord => ({
  ...buildingProject(),
  // Saved before the cap was hit: usage was charged, the overlay never re-derived.
  overlay: null,
  budget: { capUsd: 40, spentUsd: 41, sources: { owner: 1, research: 0, dispatched: 40 } },
});

describe('restart reconciliation', () => {
  it('continues watching existing work while the owner is blocked after restart', async () => {
    const host = await fakeHost();
    const record = buildingProject({ overlay: 'blocked', blockedReason: 'Needs review', milestones: [milestone('m1', {
      status: 'running', dispatch: { kind: 'workflow', id: 'loop_1', workspaceId: 'ws-1', dispatchedAt: T0, chargedUsd: 0, destination: null },
    })] });
    await seed(host, record);
    const runtime = new ArchitectRuntime(host, {});
    await runtime.start();
    try {
      host.emitState(orchestratorIndexFiles(record.folder).loops, { loops: [{ id: 'loop_1', title: 'Build', status: 'active', usage: { costUsd: 2 } }] });
      await vi.waitFor(async () => expect((await runtime.records()?.read(record.id))?.budget.sources.dispatched).toBe(2));
      expect((await runtime.records()?.read(record.id))?.blockedReason).toBe('Needs review');
    } finally {
      await runtime.dispose();
    }
  });

  it('brings an over-budget project back limited and rebuilds the index before any wake', async () => {
    const host: FakeHost = await fakeHost();
    await seed(host, overBudget());
    const runtime = new ArchitectRuntime(host, {});

    // A wake asked for before start must wait for reconcile, never run ahead of it.
    const delivered = vi.fn();
    const waiting = runtime.gate.whenOpen().then(() => delivered(host.index()?.projects[0]?.overlay));
    expect(runtime.gate.open).toBe(false);
    expect(delivered).not.toHaveBeenCalled();

    await runtime.start();
    await waiting;

    expect(runtime.gate.open).toBe(true);
    expect(delivered).toHaveBeenCalledWith('limited');
    const record = await runtime.records()?.read('proj_1');
    expect(record?.overlay).toBe('limited');
    expect(record?.phase).toBe('build');
    expect(host.index()?.projects).toEqual([expect.objectContaining({ id: 'proj_1', overlay: 'limited', spentUsd: 41, capUsd: 40 })]);
    expect(host.logs).toContain('project proj_1 comes back limited after restart');
    await runtime.dispose();
  });

  it('holds a project whose workspace is gone instead of resuming it', async () => {
    const host = await fakeHost({ workspaces: [] });
    await seed(host, buildingProject());
    const runtime = new ArchitectRuntime(host, {});
    await runtime.start();

    const record = await runtime.records()?.read('proj_1');
    expect(record?.overlay).toBe('blocked');
    expect(record?.blockedReason).toContain('ws-1');
    expect(record?.history.at(-1)?.cause).toContain('not registered');
    await runtime.dispose();
  });

  it('reconstructs durable directive, answered-decision and quiet-work wakes', async () => {
    const host = await fakeHost();
    const answeredAt = '2026-09-07T10:00:00.000Z';
    const decision = {
      id: 'd1', question: 'Ship?', options: [{ id: 'yes', label: 'Yes', consequence: 'Ship' }], recommendation: 'yes',
      reason: 'release', dependsOn: [], raisedAt: answeredAt, proposal: null,
      answer: { optionId: 'yes', note: null, answeredAt },
    };
    const record = buildingProject({
      decisions: [decision],
      directives: [{ id: 'dir-1', text: 'Use the small logo', sentAt: answeredAt, reply: null }],
      milestones: [{ ...buildingProject().milestones[0]!, status: 'approved' }],
      session: { ...buildingProject().session, lastWakeAt: '2026-09-07T09:30:00.000Z' },
    });
    await seed(host, record);
    const runtime = new ArchitectRuntime(host, {});

    await runtime.start();
    await runtime.scheduler?.idle('proj_1');

    expect(host.sessions.prompts).toHaveLength(3);
    expect(host.sessions.prompts.some((prompt) => prompt.content.includes('dir-1'))).toBe(true);
    expect(host.sessions.prompts.some((prompt) => prompt.content.includes('decision d1 was answered before restart'))).toBe(true);
    expect(host.sessions.prompts.some((prompt) => prompt.content.includes('restart found planned work'))).toBe(true);
    await runtime.dispose();
  });

  it('does nothing while the kill switch is set, and keeps the records', async () => {
    const host = await fakeHost();
    await seed(host, overBudget());
    const runtime = new ArchitectRuntime(host, { SERO_ARCHITECT: '0' });
    await runtime.start();

    expect(runtime.gate.open).toBe(false);
    expect(runtime.records()).toBeNull();
    expect(host.index()).toBeNull();
    // Removing the flag and starting again reconciles from the untouched record.
    const again = new ArchitectRuntime(host, {});
    await again.start();
    expect((await again.records()?.read('proj_1'))?.overlay).toBe('limited');
    await again.dispose();
  });
});
