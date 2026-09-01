/**
 * Pool state must fail closed. A truncated write can still parse as JSON, and
 * an empty-looking pool is a catastrophic lie about a repository that holds
 * work: it would let allocation reuse or cleanup remove checkouts nobody
 * classified. These tests hold that line at every byte offset.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { readPoolState, writePoolState } from '@electron/features/git/worktree/pool/state-store';
import { emptyPoolState, POOL_SCHEMA_VERSION, type PoolSlot, type PoolState } from '@electron/features/git/worktree/pool/types';

const roots: string[] = [];

async function tempStatePath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sero-pool-state-'));
  roots.push(dir);
  return path.join(dir, 'pool.json');
}

function leasedSlot(): PoolSlot {
  return {
    slotId: 'slot-abc',
    path: '/repo/.sero/worktrees/slot-abc',
    workspacePath: '/repo',
    state: 'leased',
    lease: {
      slotId: 'slot-abc',
      leaseId: 'lease-1',
      leaseHolder: 'loop-1-r1',
      worktreePath: '/repo/.sero/worktrees/slot-abc',
      branchName: 'feat/thing-loop-1-r1',
      branchKind: 'fresh-task',
      baseRef: 'origin/main',
      baseCommit: 'aaaa',
      acquiredHead: 'bbbb',
      acquiredAt: '2026-01-01T00:00:00.000Z',
      greenfield: false,
    },
    operation: null,
    branchName: 'feat/thing-loop-1-r1',
    branchKind: 'fresh-task',
    lastReleased: null,
    reason: 'Leased.',
    legacy: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function populatedState(): PoolState {
  return { ...emptyPoolState('repo-1', '2026-01-01T00:00:00.000Z'), slots: [leasedSlot()] };
}

afterAll(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('pool state persistence', () => {
  it('round-trips a populated pool and bumps the revision on every write', async () => {
    const statePath = await tempStatePath();
    const first = await writePoolState(statePath, populatedState());
    expect(first.revision).toBe(1);

    const read = await readPoolState(statePath);
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    expect(read.state.slots[0].lease?.leaseId).toBe('lease-1');

    const second = await writePoolState(statePath, read.state);
    expect(second.revision).toBe(2);
  });

  it('reports an absent state as empty, not unavailable', async () => {
    const statePath = await tempStatePath();
    expect((await readPoolState(statePath)).status).toBe('empty');
  });

  it('leaves no temporary file behind after a write', async () => {
    const statePath = await tempStatePath();
    await writePoolState(statePath, populatedState());
    const entries = await readdir(path.dirname(statePath));
    expect(entries).toEqual(['pool.json']);
  });

  it('refuses a state written by an unknown schema version', async () => {
    const statePath = await tempStatePath();
    const state = { ...populatedState(), version: POOL_SCHEMA_VERSION + 1 };
    await writeFile(statePath, JSON.stringify(state), 'utf8');
    const read = await readPoolState(statePath);
    expect(read.status).toBe('unavailable');
  });

  it('never reads a truncated state as usable, at any byte offset', async () => {
    const statePath = await tempStatePath();
    await writePoolState(statePath, populatedState());
    const whole = await readFile(statePath, 'utf8');

    for (let length = 0; length < whole.length; length += 1) {
      await writeFile(statePath, whole.slice(0, length), 'utf8');
      const read = await readPoolState(statePath);
      // A prefix is either unreadable, or — for the one prefix that is not —
      // it must still describe the same leased slot. It must never come back
      // as a pool with no slots, which is what would authorise reuse.
      if (read.status === 'ok') {
        expect(read.state.slots).toHaveLength(1);
        expect(read.state.slots[0].lease?.leaseId).toBe('lease-1');
      } else {
        expect(read.status).toBe('unavailable');
      }
    }
  });

  it('rejects a slot record with one wrong field rather than trusting the rest', async () => {
    const statePath = await tempStatePath();
    const state = populatedState();
    const broken = {
      ...state,
      slots: [{ ...state.slots[0], state: 'somewhere-else' }],
    };
    await writeFile(statePath, JSON.stringify(broken), 'utf8');
    expect((await readPoolState(statePath)).status).toBe('unavailable');
  });

  it('rejects a state whose slot and lease disagree with each other', async () => {
    // Each of these files is syntactically perfect. Every one of them would,
    // if trusted, hand a consumer a path, a branch or an owner that Git and
    // containment never proved.
    const disagreements: Record<string, (state: PoolState) => unknown> = {
      'the lease names another slot': (state) => ({
        ...state,
        slots: [{ ...state.slots[0], lease: { ...leasedSlot().lease!, slotId: 'slot-other' } }],
      }),
      'the lease names another path': (state) => ({
        ...state,
        slots: [{ ...state.slots[0], lease: { ...leasedSlot().lease!, worktreePath: '/elsewhere/slot-abc' } }],
      }),
      'the lease names another branch': (state) => ({
        ...state,
        slots: [{ ...state.slots[0], lease: { ...leasedSlot().lease!, branchName: 'feat/something-else' } }],
      }),
      'the lease names another branch kind': (state) => ({
        ...state,
        slots: [{ ...state.slots[0], lease: { ...leasedSlot().lease!, branchKind: 'external-pr' } }],
      }),
      'a leased slot holds no lease': (state) => ({
        ...state,
        slots: [{ ...state.slots[0], lease: null }],
      }),
      'the operation belongs to another lease': (state) => ({
        ...state,
        slots: [{
          ...state.slots[0],
          operation: {
            operationId: 'op-1', pid: 1, startedAt: '2026-01-01T00:00:00.000Z',
            intendedState: 'leased', leaseId: 'lease-somewhere-else',
          },
        }],
      }),
      'the last release belongs to another slot': (state) => ({
        ...state,
        slots: [{
          ...state.slots[0],
          lastReleased: {
            slotId: 'slot-other', leaseId: 'lease-1', status: 'preserved',
            at: '2026-01-01T00:00:00.000Z', reason: 'kept',
          },
        }],
      }),
      'two slots claim one path': (state) => ({
        ...state,
        slots: [state.slots[0], { ...leasedSlot(), slotId: 'slot-def', lease: null, state: 'damaged' }],
      }),
      'two slots hold one lease': (state) => ({
        ...state,
        slots: [
          state.slots[0],
          { ...leasedSlot(), slotId: 'slot-def', path: '/repo/.sero/worktrees/slot-def',
            lease: { ...leasedSlot().lease!, slotId: 'slot-def', worktreePath: '/repo/.sero/worktrees/slot-def' } },
        ],
      }),
    };

    for (const [label, mutate] of Object.entries(disagreements)) {
      const statePath = await tempStatePath();
      await writeFile(statePath, JSON.stringify(mutate(populatedState())), 'utf8');
      const read = await readPoolState(statePath);
      expect(read.status, label).toBe('unavailable');
      if (read.status === 'unavailable') expect(read.reason, label).toContain('disagrees with itself');
    }
  });

  it('accepts the consistent state those cases were derived from', async () => {
    const statePath = await tempStatePath();
    await writeFile(statePath, JSON.stringify(populatedState()), 'utf8');
    expect((await readPoolState(statePath)).status).toBe('ok');
  });

  it('preserves corrupt bytes and keeps answering unavailable on re-read', async () => {
    const statePath = await tempStatePath();
    await writeFile(statePath, '{"version": 1, "slots": [', 'utf8');

    expect((await readPoolState(statePath)).status).toBe('unavailable');
    // The unreadable file stays in place: a later read must not find a
    // conveniently empty directory and start a fresh, reusable pool.
    expect((await readPoolState(statePath)).status).toBe('unavailable');

    const entries = await readdir(path.dirname(statePath));
    expect(entries).toContain('pool.json');
    expect(entries.filter((name) => name.startsWith('pool.json.corrupt-'))).toHaveLength(1);
  });
});
