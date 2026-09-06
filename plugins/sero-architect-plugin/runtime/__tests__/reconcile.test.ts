import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProjectRecord, type ProjectRecord } from '../../shared/record';
import type { ArchitectIndex } from '../../shared/types';
import type { ArchitectHost } from '../host';
import { ArchitectRuntime } from '../index';
import { createRecordStore } from '../record-store';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fakeHost(workspaceIds: string[]): Promise<ArchitectHost & { index: () => ArchitectIndex | null; logs: string[] }> {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'architect-runtime-'));
  dirs.push(homeDir);
  let index: ArchitectIndex | null = null;
  const logs: string[] = [];
  return {
    homeDir: async () => homeDir,
    indexFile: path.join(homeDir, 'state.json'),
    updateIndex: async (updater) => { index = updater(index); },
    listWorkspaces: async () => workspaceIds.map((id) => ({ id, name: id, path: `/repos/${id}`, open: true })),
    now: () => '2026-09-07T08:00:00.000Z',
    log: (message) => { logs.push(message); },
    index: () => index,
    logs,
  };
}

/** Writes a record straight to disk the way a previous run would have left it. */
async function seed(host: ArchitectHost, record: ProjectRecord): Promise<void> {
  const store = createRecordStore({ homeDir: await host.homeDir(), indexFile: host.indexFile, updateIndex: async () => {} });
  await store.write(record);
}

function building(overrides: Partial<ProjectRecord>): ProjectRecord {
  const base = createProjectRecord({ id: 'hollow', name: 'Hollow', idea: 'x', folder: '~/p', now: '2026-09-06T10:00:00.000Z' });
  return { ...base, phase: 'build', workspaceId: 'ws-1', budget: { capUsd: 40, spentUsd: 0, sources: { owner: 0, research: 0, dispatched: 0 } }, ...overrides };
}

describe('restart reconciliation', () => {
  it('brings an over-budget project back limited and rebuilds the index before any wake', async () => {
    const host = await fakeHost(['ws-1']);
    // Saved before the cap was hit: usage was charged, the overlay never re-derived.
    await seed(host, building({ overlay: null, budget: { capUsd: 40, spentUsd: 41, sources: { owner: 1, research: 0, dispatched: 40 } } }));
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
    const record = await runtime.records()?.read('hollow');
    expect(record?.overlay).toBe('limited');
    expect(record?.phase).toBe('build');
    expect(host.index()?.projects).toEqual([expect.objectContaining({ id: 'hollow', overlay: 'limited', spentUsd: 41, capUsd: 40 })]);
    expect(host.logs).toContain('project hollow comes back limited after restart');
  });

  it('holds a project whose workspace is gone instead of resuming it', async () => {
    const host = await fakeHost([]);
    await seed(host, building({}));
    const runtime = new ArchitectRuntime(host, {});
    await runtime.start();

    const record = await runtime.records()?.read('hollow');
    expect(record?.overlay).toBe('blocked');
    expect(record?.blockedReason).toContain('ws-1');
    expect(record?.history.at(-1)?.cause).toContain('not registered');
  });

  it('does nothing while the kill switch is set, and keeps the records', async () => {
    const host = await fakeHost(['ws-1']);
    await seed(host, building({ budget: { capUsd: 40, spentUsd: 41, sources: { owner: 0, research: 0, dispatched: 41 } } }));
    const runtime = new ArchitectRuntime(host, { SERO_ARCHITECT: '0' });
    await runtime.start();

    expect(runtime.gate.open).toBe(false);
    expect(runtime.records()).toBeNull();
    expect(host.index()).toBeNull();
    // Removing the flag and starting again reconciles from the untouched record.
    const again = new ArchitectRuntime(host, {});
    await again.start();
    expect((await again.records()?.read('hollow'))?.overlay).toBe('limited');
  });
});
