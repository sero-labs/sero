import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { acquireWorktree } from '@electron/features/git/worktree/pool/acquire';
import {
  classifyDisposability,
  type PullRequestEvidenceProvider,
} from '@electron/features/git/worktree/pool/disposability';
import { openPool } from '@electron/features/git/worktree/pool/session';
import type { PoolSlot } from '@electron/features/git/worktree/pool/types';
import { git, newWorkspaceRepo, removeWorkspaceRepos } from '../worktree-test-helpers';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

function evidence(state: 'open' | 'closed' | 'merged' | 'unknown'): PullRequestEvidenceProvider {
  return { forBranch: async (_workspace, _branch, knownNumber) => ({ number: knownNumber ?? 17, state }) };
}

async function slotWithCommit(
  holder: string,
  existingBranch?: string,
  pullRequestNumber?: number,
): Promise<{ workspace: string; slot: PoolSlot }> {
  const { workspace } = await newWorkspaceRepo('sero-disposal-');
  if (existingBranch) await git(workspace, 'branch', existingBranch, 'main');
  const result = await acquireWorktree(workspace, {
    holder,
    title: 'Change parser',
    existingBranch,
    pullRequestNumber,
  });
  if (result.status !== 'acquired') throw new Error(result.reason);
  await writeFile(path.join(result.lease.worktreePath, `${holder}.md`), 'change');
  await git(result.lease.worktreePath, 'add', '.');
  await git(result.lease.worktreePath, 'commit', '-m', `change ${holder}`);
  const opened = await openPool(workspace);
  if (opened.status !== 'ok') throw new Error(opened.reason);
  const slot = opened.session.state.slots.find((candidate) => candidate.slotId === result.lease.slotId);
  if (!slot) throw new Error('slot missing');
  return { workspace, slot };
}

afterAll(removeWorkspaceRepos);

describe('branch disposability', () => {
  it('accepts a merge commit only when the exact target contains the branch tip', async () => {
    const { workspace, slot } = await slotWithCommit('merge-r1');
    await git(workspace, 'merge', '--no-ff', '-m', 'merge feature', slot.branchName as string);
    const target = await git(workspace, 'rev-parse', 'HEAD');

    const result = await classifyDisposability(workspace, slot, target, evidence('unknown'));
    expect(result).toMatchObject({ status: 'disposable' });
    expect(result.reason).toContain('contained');
  });

  it('classifies squash, rebase, open, closed, and local-unmerged evidence from one branch', async () => {
    const { workspace, slot } = await slotWithCommit('pr-evidence-r1', undefined, 42);
    const target = await git(workspace, 'rev-parse', 'main');

    const authoritative = await classifyDisposability(workspace, slot, target, evidence('merged'));
    expect(authoritative).toMatchObject({ status: 'disposable' });
    expect(authoritative.reason).toContain('including squash or rebase merges');
    for (const state of ['open', 'closed'] as const) {
      const result = await classifyDisposability(workspace, slot, target, evidence(state));
      expect(result.status).toBe('unmerged');
      expect(result.reason).toContain(state);
    }
    const local = await classifyDisposability(workspace, slot, target, evidence('unknown'));
    expect(local.status).toBe('unmerged');
    expect(local.reason).toContain('no merged PR');
  });

  it('requires authoritative merged evidence for an external PR checkout', async () => {
    const { workspace, slot } = await slotWithCommit('external-r1', 'contributor/topic', 55);
    const target = await git(workspace, 'rev-parse', 'main');

    expect(await classifyDisposability(workspace, slot, target, evidence('open')))
      .toMatchObject({ status: 'unmerged' });
    expect(await classifyDisposability(workspace, slot, target, evidence('merged')))
      .toMatchObject({ status: 'disposable' });
  });
});
