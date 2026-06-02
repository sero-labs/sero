import type { Remote, SyncResult } from '@sero-ai/common';

import { parseRemotes } from '../../support/parsers';
import type { GitRunner } from '../git-runner';

export async function listRemotes(
  runner: GitRunner,
  workspaceId: string,
): Promise<Remote[]> {
  const result = await runner.run(workspaceId, ['remote', '-v']);
  if (result.exitCode !== 0) {
    return [];
  }

  return parseRemotes(result.stdout);
}

export async function addRemote(
  runner: GitRunner,
  workspaceId: string,
  name: string,
  url: string,
): Promise<void> {
  await runner.ensureRepoInitialized(workspaceId);
  const result = await runner.run(workspaceId, ['remote', 'add', name, url]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to add remote '${name}'`);
  }
}

export async function removeRemote(
  runner: GitRunner,
  workspaceId: string,
  name: string,
): Promise<void> {
  const result = await runner.run(workspaceId, ['remote', 'remove', name]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to remove remote '${name}'`);
  }
}

export async function setRemoteUrl(
  runner: GitRunner,
  workspaceId: string,
  name: string,
  url: string,
): Promise<void> {
  const result = await runner.run(workspaceId, ['remote', 'set-url', name, url]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to update remote URL for '${name}'`);
  }
}

async function resolveRemoteBranch(
  runner: GitRunner,
  workspaceId: string,
  remote: string,
): Promise<string | null> {
  await runner.run(workspaceId, ['remote', 'set-head', remote, '--auto'], 60_000);

  const head = await runner.run(
    workspaceId,
    ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`],
    10_000,
  );
  const headBranch = head.stdout.trim().replace(`${remote}/`, '');
  if (head.exitCode === 0 && headBranch) return headBranch;

  const branches = await runner.run(
    workspaceId,
    ['branch', '-r', '--format=%(refname:short)'],
    10_000,
  );
  if (branches.exitCode !== 0) return null;

  const names = branches.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${remote}/`) && !line.endsWith('/HEAD'))
    .map((line) => line.slice(remote.length + 1));

  return names.find((name) => name === 'main') ?? names.find((name) => name === 'master') ?? names[0] ?? null;
}

export async function checkoutRemote(
  runner: GitRunner,
  workspaceId: string,
  remote = 'origin',
): Promise<SyncResult> {
  await runner.ensureRepoInitialized(workspaceId);

  const fetch = await runner.run(workspaceId, ['fetch', remote], 120_000);
  if (fetch.exitCode !== 0) {
    return { success: false, message: fetch.stderr || `Failed to fetch ${remote}` };
  }

  const branch = await resolveRemoteBranch(runner, workspaceId, remote);
  if (!branch) {
    return { success: true, message: `Connected ${remote}; no remote branches to import` };
  }

  const remoteRef = `${remote}/${branch}`;
  const checkout = await runner.run(workspaceId, ['checkout', '-B', branch, remoteRef], 120_000);
  if (checkout.exitCode !== 0) {
    return { success: false, message: checkout.stderr || `Failed to check out ${remoteRef}` };
  }

  const upstream = await runner.run(
    workspaceId,
    ['branch', '--set-upstream-to', remoteRef, branch],
    10_000,
  );
  if (upstream.exitCode !== 0) {
    return { success: true, message: `Checked out ${remoteRef}. ${upstream.stderr}`.trim() };
  }

  return { success: true, message: `Checked out ${remoteRef}` };
}

export async function resolvePushRemote(
  runner: GitRunner,
  workspaceId: string,
): Promise<string | undefined> {
  try {
    const remotes = await listRemotes(runner, workspaceId);
    return remotes.find((r) => r.name === 'origin')?.name ?? remotes[0]?.name;
  } catch (err) {
    console.warn('[vcs-ops] Failed to resolve push remote:', err);
    return undefined;
  }
}
