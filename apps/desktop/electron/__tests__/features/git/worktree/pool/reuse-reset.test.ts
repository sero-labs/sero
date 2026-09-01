import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import type { PullRequestEvidenceProvider } from '@electron/features/git/worktree/pool/disposability';
import { SeroOwnedProcessRegistry } from '@electron/features/git/worktree/pool/owned-processes';
import { WorktreeProcessGuard, type ProcessDetectionResult } from '@electron/features/git/worktree/pool/process-guard';
import { releaseWorktree, type ReleaseWorktreeDependencies } from '@electron/features/git/worktree/pool/release';
import { openPool } from '@electron/features/git/worktree/pool/session';
import type { PoolState } from '@electron/features/git/worktree/pool/types';
import type { AppRuntimeWorktreeLease } from '@sero-ai/common';
import { git, newWorkspaceRepo, removeWorkspaceRepos } from '../worktree-test-helpers';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const clearGuard = guard({ status: 'clear' });
const mergedPullRequest: PullRequestEvidenceProvider = {
  forBranch: async (_workspace, _branch, knownNumber) => ({ number: knownNumber, state: 'merged' }),
};

function guard(result: ProcessDetectionResult): WorktreeProcessGuard {
  return new WorktreeProcessGuard({
    owned: new SeroOwnedProcessRegistry(),
    detector: { platform: 'linux', detect: async () => result },
  });
}

async function workspaceWithIgnores(): Promise<string> {
  const { workspace } = await newWorkspaceRepo('sero-pool-reuse-');
  await writeFile(path.join(workspace, '.gitignore'), 'node_modules/\ndist/\n');
  await git(workspace, 'add', '.gitignore');
  await git(workspace, 'commit', '-m', 'add ignores');
  return workspace;
}

async function acquire(workspace: string, holder: string, existingBranch?: string): Promise<AppRuntimeWorktreeLease> {
  const result = await acquireWorktree(workspace, { holder, title: 'Build parser', existingBranch }, { processGuard: clearGuard });
  if (result.status !== 'acquired') throw new Error(result.reason);
  return result.lease;
}

async function recycle(
  workspace: string,
  lease: AppRuntimeWorktreeLease,
  dependencies: ReleaseWorktreeDependencies = {},
) {
  return releaseWorktree(workspace, {
    slotId: lease.slotId,
    expectedLeaseId: lease.leaseId,
    disposition: 'recycle',
  }, { processGuard: clearGuard, ...dependencies });
}

function statePath(workspace: string): string {
  return path.join(workspace, '.git', 'sero-worktree-pool', 'pool.json');
}

afterAll(removeWorkspaceRepos);

describe('cache-preserving reuse', () => {
  it('treats a fresh-branch collision as recovery evidence instead of attaching a lease', async () => {
    const workspace = await workspaceWithIgnores();
    const branch = 'build/build-parser-collision-holder';
    await git(workspace, 'branch', branch, 'main');

    const result = await acquireWorktree(workspace, {
      holder: 'collision-holder',
      title: 'Build parser',
    }, { processGuard: clearGuard });
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.reason).toContain('reattachment or recovery evidence');
    expect(await git(workspace, 'rev-parse', '--verify', `refs/heads/${branch}`)).toBeTruthy();
  });

  it('resets to the exact target, preserves ignored caches, and reuses the slot with a new lease', async () => {
    const workspace = await workspaceWithIgnores();
    const first = await acquire(workspace, 'workflow-r1');
    const dependency = path.join(first.worktreePath, 'node_modules', 'pkg', 'cache.txt');
    const output = path.join(first.worktreePath, 'dist', 'compiler.cache');
    await mkdir(path.dirname(dependency), { recursive: true });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(dependency, 'dependency cache');
    await writeFile(output, 'compiler output');
    const target = await git(workspace, 'rev-parse', 'main');

    expect(await recycle(workspace, first)).toMatchObject({ status: 'released', checkout: 'removed' });
    expect(await git(first.worktreePath, 'rev-parse', 'HEAD')).toBe(target);
    expect(await git(first.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(await git(first.worktreePath, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(await readFile(dependency, 'utf8')).toBe('dependency cache');
    expect(await readFile(output, 'utf8')).toBe('compiler output');

    const second = await acquire(workspace, 'room-r1');
    expect(second.slotId).toBe(first.slotId);
    expect(second.leaseId).not.toBe(first.leaseId);
    expect(second.branchName).toBe('build/build-parser-room-r1');
    expect(await readFile(dependency, 'utf8')).toBe('dependency cache');

    const delayed = await recycle(workspace, first);
    expect(delayed.status).toBe('stale-lease');
    expect(await git(second.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(second.branchName);
  });

  it.each([
    ['tracked modification', async (root: string) => writeFile(path.join(root, 'readme.md'), 'changed')],
    ['non-ignored untracked file', async (root: string) => writeFile(path.join(root, 'notes.txt'), 'work')],
  ])('preserves a checkout with a %s and reports why', async (_name, damage) => {
    const workspace = await workspaceWithIgnores();
    const lease = await acquire(workspace, 'workflow-r1');
    await damage(lease.worktreePath);

    const result = await recycle(workspace, lease);
    expect(result.status).toBe('preserved');
    expect(result.reason).toContain('tracked changes or non-ignored untracked files');
    expect(await stat(lease.worktreePath)).toBeTruthy();
  });

  it('preserves the lease when a process is detected or detection fails', async () => {
    const workspace = await workspaceWithIgnores();
    const processStates: ProcessDetectionResult[] = [
      { status: 'in-use' as const, processes: [{ pid: 99, command: 'node' }] },
      { status: 'unverifiable' as const, reason: 'permission denied' },
    ];
    const leases = await Promise.all(processStates.map((processState) =>
      acquire(workspace, `workflow-${processState.status}`),
    ));
    for (const [index, processState] of processStates.entries()) {
      const lease = leases[index];
      const result = await recycle(workspace, lease, { processGuard: guard(processState) });
      expect(result.status).toBe(processState.status === 'in-use' ? 'preserved' : 'recovery-required');
      expect(await stat(lease.worktreePath)).toBeTruthy();
      const opened = await openPool(workspace);
      if (opened.status !== 'ok') throw new Error(opened.reason);
      expect(opened.session.state.slots.find((slot) => slot.slotId === lease.slotId)?.lease?.leaseId)
        .toBe(lease.leaseId);
    }
  });

  it.each([
    {
      name: 'dirty checkout',
      damage: async (root: string, workspace: string) => {
        await writeFile(path.join(root, 'unexpected.txt'), 'do not erase');
        return { processGuard: clearGuard, expected: 'became dirty' };
      },
    },
    {
      name: 'detected process',
      damage: async (_root: string, _workspace: string) => ({
        processGuard: guard({ status: 'in-use', processes: [{ pid: 73, command: 'python' }] }),
        expected: 'Foreign processes were not terminated',
      }),
    },
    {
      name: 'locked registration',
      damage: async (root: string, workspace: string) => {
        await git(workspace, 'worktree', 'lock', '--reason', 'still installing', root);
        return { processGuard: clearGuard, expected: 'locked' };
      },
    },
  ])('preserves an idle slot whose $name reuse proof fails and allocates elsewhere', async ({ damage }) => {
    const workspace = await workspaceWithIgnores();
    const first = await acquire(workspace, 'first-holder');
    expect((await recycle(workspace, first)).status).toBe('released');
    const proof = await damage(first.worktreePath, workspace);

    const next = await acquireWorktree(workspace, {
      holder: 'next-holder',
      title: 'Build parser',
    }, { processGuard: proof.processGuard });
    expect(next.status).toBe('acquired');
    if (next.status !== 'acquired') return;
    expect(next.lease.slotId).not.toBe(first.slotId);
    const opened = await openPool(workspace);
    if (opened.status !== 'ok') throw new Error(opened.reason);
    const preserved = opened.session.state.slots.find((slot) => slot.slotId === first.slotId);
    expect(preserved?.state).not.toBe('available');
    expect(preserved?.reason).toContain(proof.expected);
    expect(await stat(first.worktreePath)).toBeTruthy();
  });

  it('never deletes an external pull-request branch after authoritative merge evidence', async () => {
    const workspace = await workspaceWithIgnores();
    await git(workspace, 'branch', 'contributor/topic', 'main');
    const lease = await acquire(workspace, 'pr-r1', 'contributor/topic');
    expect(await recycle(workspace, lease, { pullRequests: mergedPullRequest })).toMatchObject({ status: 'released' });
    expect(await git(workspace, 'rev-parse', '--verify', 'refs/heads/contributor/topic')).toBeTruthy();
    expect(await git(lease.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
  });

  it('retains two idle slots without limiting active Workflow or Room leases', async () => {
    const workspace = await workspaceWithIgnores();
    const leases = await Promise.all([
      acquire(workspace, 'workflow-a'),
      acquire(workspace, 'workflow-b'),
      acquire(workspace, 'room-member-a'),
      acquire(workspace, 'room-member-b'),
      acquire(workspace, 'room-member-c'),
    ]);
    expect(new Set(leases.map((lease) => lease.slotId)).size).toBe(5);

    const releases = [];
    for (const lease of leases) releases.push(await recycle(workspace, lease));
    expect(releases.every((result) => result.status === 'released')).toBe(true);
    const opened = await openPool(workspace);
    if (opened.status !== 'ok') throw new Error(opened.reason);
    expect(opened.session.state.slots.filter((slot) => slot.state === 'available')).toHaveLength(2);
    expect(opened.session.state.slots.filter((slot) => slot.state === 'leased')).toHaveLength(0);
    expect(await stat(leases[4].worktreePath).catch(() => null)).toBeNull();
  });
});

describe('transition fault fences', () => {
  it('confirms Sero-owned shutdown and detection before reset starts', async () => {
    const workspace = await workspaceWithIgnores();
    const lease = await acquire(workspace, 'shutdown-order');
    const events: string[] = [];
    const owned = new SeroOwnedProcessRegistry();
    owned.register({
      id: 'terminal-1',
      kind: 'terminal',
      cwd: lease.worktreePath,
      stop: async () => { events.push('owned-stopped'); },
    });
    const processGuard = new WorktreeProcessGuard({
      owned,
      detector: {
        platform: 'linux',
        detect: async () => {
          events.push('detected-clear');
          return { status: 'clear' };
        },
      },
    });

    await expect(recycle(workspace, lease, {
      processGuard,
      fault: async (point) => {
        if (point !== 'after-owned-shutdown') return;
        events.push('reset-boundary');
        expect(await git(lease.worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(lease.branchName);
        throw new Error('stop before reset');
      },
    })).rejects.toThrow('stop before reset');
    expect(events).toEqual(['owned-stopped', 'detected-clear', 'reset-boundary']);
  });

  it.each([
    'after-reservation',
    'after-owned-shutdown',
    'after-reset',
    'before-final-commit',
  ] as const)('does not expose an available slot after a crash at %s', async (faultPoint) => {
    const workspace = await workspaceWithIgnores();
    const lease = await acquire(workspace, `fault-${faultPoint}`);
    await expect(recycle(workspace, lease, {
      fault: (point) => { if (point === faultPoint) throw new Error(`crash at ${point}`); },
    })).rejects.toThrow(`crash at ${faultPoint}`);

    const raw = JSON.parse(await readFile(statePath(workspace), 'utf8')) as PoolState;
    const slot = raw.slots.find((candidate) => candidate.slotId === lease.slotId);
    expect(slot?.state).toBe('recycling');
    expect(slot?.operation?.resetTarget?.commit).toBeTruthy();
    expect(slot?.lease?.leaseId).toBe(lease.leaseId);
  });
});
