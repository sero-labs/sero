import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ProjectRecord } from '../../shared/record';
import type { ArchitectHost } from '../host';
import { ArchitectRuntime } from '../index';
import { createRecordStore } from '../record-store';
import { buildingProject, cleanupHosts, fakeHost, type FakeHost } from './helpers';

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
