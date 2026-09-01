/**
 * Reconciliation after a crash or a moved directory. The rule under test is
 * one-directional: evidence may only ever make a slot LESS reusable. Nothing
 * here promotes a slot to `available`, deletes a directory, or prunes a
 * registration.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import { openPool } from '@electron/features/git/worktree/pool/session';
import type { PoolState } from '@electron/features/git/worktree/pool/types';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

/** A pid that cannot be running: reconciliation must read it as a crash. */
const DEAD_PID = 2 ** 22;

async function newWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-pool-rec-'));
  roots.push(root);
  const workspace = path.join(root, 'workspace');
  await execFileAsync('git', ['init', '-b', 'main', workspace]);
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: workspace });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: workspace });
  await writeFile(path.join(workspace, 'readme.md'), 'hello');
  await execFileAsync('git', ['add', '.'], { cwd: workspace });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: workspace });
  return workspace;
}

function statePath(workspace: string): string {
  return path.join(workspace, '.git', 'sero-worktree-pool', 'pool.json');
}

async function readState(workspace: string): Promise<PoolState> {
  return JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
}

async function writeState(workspace: string, state: PoolState): Promise<void> {
  await writeFile(statePath(workspace), JSON.stringify(state, null, 2), 'utf8');
}

async function leasedWorkspace(holder = 'loop-1-r1'): Promise<{ workspace: string; slotPath: string; slotId: string }> {
  const workspace = await newWorkspace();
  const outcome = await acquireWorktree(workspace, { holder, title: 'Fix the parser' });
  if (outcome.status !== 'acquired') throw new Error(outcome.reason);
  return { workspace, slotPath: outcome.lease.worktreePath, slotId: outcome.lease.slotId };
}

async function classify(workspace: string, slotId: string): Promise<{ state: string; reason: string }> {
  const opened = await openPool(workspace);
  if (opened.status !== 'ok') throw new Error(opened.reason);
  const slot = opened.session.state.slots.find((candidate) => candidate.slotId === slotId);
  if (!slot) throw new Error(`slot ${slotId} is gone`);
  return { state: slot.state, reason: slot.reason };
}

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('crash reconciliation', () => {
  it('classifies every interrupted transition of a dead process, and reuses none of them', async () => {
    for (const transition of ['provisioning', 'recycling', 'removing'] as const) {
      const { workspace, slotId } = await leasedWorkspace();
      const state = await readState(workspace);
      await writeState(workspace, {
        ...state,
        slots: state.slots.map((slot) => (slot.slotId === slotId
          ? {
            ...slot,
            state: transition,
            operation: {
              operationId: 'op-1',
              pid: DEAD_PID,
              startedAt: '2026-01-01T00:00:00.000Z',
              intendedState: 'leased' as const,
              leaseId: slot.lease?.leaseId ?? null,
            },
            updatedAt: '2026-01-01T00:00:00.000Z',
          }
          : slot)),
      });

      const classified = await classify(workspace, slotId);
      // Interrupted provisioning with complete evidence is a valid lease; the
      // destructive transitions are never resolved automatically.
      expect(classified.state).toBe(transition === 'provisioning' ? 'leased' : 'recovery-required');
      expect(classified.state).not.toBe('available');
    }
  });

  it('leaves an in-flight transition of a live process alone', async () => {
    const { workspace, slotId } = await leasedWorkspace();
    const state = await readState(workspace);
    await writeState(workspace, {
      ...state,
      slots: state.slots.map((slot) => (slot.slotId === slotId
        ? {
          ...slot,
          state: 'recycling' as const,
          operation: {
            operationId: 'op-live',
            pid: process.pid,
            startedAt: '2026-01-01T00:00:00.000Z',
            intendedState: 'available' as const,
            leaseId: slot.lease?.leaseId ?? null,
          },
          updatedAt: '2026-01-01T00:00:00.000Z',
        }
        : slot)),
    });

    expect((await classify(workspace, slotId)).state).toBe('recycling');
  });
});

describe('evidence disagreement', () => {
  it('calls a directory Git does not register damaged, and does not delete it', async () => {
    const { workspace, slotId, slotPath } = await leasedWorkspace();
    await rm(path.join(workspace, '.git', 'worktrees'), { recursive: true, force: true });

    expect((await classify(workspace, slotId)).state).toBe('damaged');
    expect(await stat(slotPath)).toBeTruthy();
  });

  it('calls a registration whose directory is gone orphaned', async () => {
    const { workspace, slotId, slotPath } = await leasedWorkspace();
    await rm(slotPath, { recursive: true, force: true });

    expect((await classify(workspace, slotId)).state).toBe('orphaned');
  });

  it('refuses a checkout whose branch is not the one recorded', async () => {
    const { workspace, slotId, slotPath } = await leasedWorkspace();
    await execFileAsync('git', ['checkout', '-b', 'feat/somewhere-else'], { cwd: slotPath });

    const classified = await classify(workspace, slotId);
    expect(classified.state).toBe('recovery-required');
    expect(classified.reason).toContain('feat/somewhere-else');
  });

  it('refuses a detached checkout, which is not a Sero work mode', async () => {
    const { workspace, slotId, slotPath } = await leasedWorkspace();
    await execFileAsync('git', ['checkout', '--detach'], { cwd: slotPath });

    expect((await classify(workspace, slotId)).state).toBe('recovery-required');
  });

  it('reports a locked worktree as in use', async () => {
    const { workspace, slotId, slotPath } = await leasedWorkspace();
    await execFileAsync('git', ['worktree', 'lock', '--reason', 'the installer is running', slotPath], { cwd: workspace });

    const classified = await classify(workspace, slotId);
    expect(classified.state).toBe('in-use');
    expect(classified.reason).toContain('the installer is running');
  });

  it('adopts an unknown slot directory rather than treating it as free space', async () => {
    const { workspace, slotPath } = await leasedWorkspace();
    const strayPath = path.join(path.dirname(slotPath), 'slot-strayaaaaaa');
    await execFileAsync('git', ['worktree', 'add', '-b', 'feat/stray', strayPath], { cwd: workspace });

    const opened = await openPool(workspace);
    if (opened.status !== 'ok') throw new Error(opened.reason);
    const stray = opened.session.state.slots.find((slot) => slot.path === strayPath);
    expect(stray?.state).toBe('recovery-required');
  });
});

describe('unreadable repositories', () => {
  it('makes the repository unavailable when Git evidence cannot be read', async () => {
    const workspace = await newWorkspace();
    await acquireWorktree(workspace, { holder: 'loop-1-r1', title: 'Fix the parser' });
    // Break the repository AFTER the pool exists: the state file is intact,
    // and only Git is unreadable.
    await rename(path.join(workspace, '.git', 'HEAD'), path.join(workspace, '.git', 'HEAD.moved'));

    const opened = await openPool(workspace);
    expect(opened.status).toBe('unavailable');
  });

  it('never allocates from a repository whose state cannot be read', async () => {
    const { workspace } = await leasedWorkspace();
    await writeFile(statePath(workspace), '{"version": 1, "slots": [', 'utf8');

    const outcome = await acquireWorktree(workspace, { holder: 'loop-2-r1', title: 'Another task' });
    expect(outcome.status).toBe('blocked');
  });
});
