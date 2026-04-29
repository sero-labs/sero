import type { Remote } from '@sero-ai/common';

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
