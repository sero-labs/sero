import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContainerCleanupService } from '@electron/features/workspace/runtime/container-cleanup/service';
import type { ContainerCleanupProvider } from '@electron/features/workspace/runtime/container-cleanup/types';

const temporaryRoots: string[] = [];
const identity = {
  profileId: 'profile-a',
  workspaceId: 'workspace-a',
  workspacePath: '/profiles/a/workspaces/workspace-a',
};

async function statePath(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-container-cleanup-'));
  temporaryRoots.push(root);
  return path.join(root, 'container-cleanup.json');
}

function provider(
  name: 'apple-container' | 'docker',
  deleteOwned: ContainerCleanupProvider['deleteOwned'],
  listOwned: ContainerCleanupProvider['listOwned'] = async () => [],
): ContainerCleanupProvider {
  return { provider: name, deleteOwned, listOwned };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('persistent container cleanup', () => {
  it('deletes an uncached workspace through both providers', async () => {
    const appleDelete = vi.fn(async () => 'absent' as const);
    const dockerDelete = vi.fn(async () => 'deleted' as const);
    const service = new ContainerCleanupService(await statePath(), [
      provider('apple-container', appleDelete),
      provider('docker', dockerDelete),
    ]);

    const result = await service.requestDeletion(identity);

    expect(result.pending).toBe(0);
    expect(appleDelete).toHaveBeenCalledWith(expect.objectContaining(identity));
    expect(dockerDelete).toHaveBeenCalledWith(expect.objectContaining(identity));
  });

  it('survives provider failure and retries after a new service instance starts', async () => {
    const cleanupStatePath = await statePath();
    const unavailable = provider('docker', vi.fn(async () => { throw new Error('daemon unavailable'); }));
    const first = new ContainerCleanupService(cleanupStatePath, [unavailable]);

    const failed = await first.requestDeletion(identity, ['docker']);
    expect(failed.pending).toBe(1);

    const deleteOwned = vi.fn(async () => 'deleted' as const);
    const restarted = new ContainerCleanupService(cleanupStatePath, [provider('docker', deleteOwned)]);
    const retried = await restarted.retryPending();

    expect(retried.pending).toBe(0);
    expect(deleteOwned).toHaveBeenCalledWith(expect.objectContaining(identity));
    const persisted = JSON.parse(await fs.readFile(cleanupStatePath, 'utf8')) as { pending: unknown[] };
    expect(persisted.pending).toEqual([]);
  });

  it('reconciles orphans without deleting workspaces from another registered profile', async () => {
    const dockerDelete = vi.fn(async () => 'deleted' as const);
    const appleDelete = vi.fn(async () => 'deleted' as const);
    const dockerList = vi.fn(async () => [
      { provider: 'docker' as const, containerId: 'kept', workspaceId: 'shared', workspacePath: '/profiles/b/workspaces/shared' },
      { provider: 'docker' as const, containerId: 'orphan', workspaceId: 'gone', workspacePath: '/profiles/old/workspaces/gone' },
    ]);
    const appleList = vi.fn(async () => [
      { provider: 'apple-container' as const, containerId: 'apple-orphan', workspaceId: 'apple-gone', workspacePath: '/profiles/old/workspaces/apple-gone' },
    ]);
    const service = new ContainerCleanupService(await statePath(), [
      provider('docker', dockerDelete, dockerList),
      provider('apple-container', appleDelete, appleList),
    ]);
    const result = await service.reconcile([
      { profileId: 'profile-a', workspaceId: 'workspace-a', workspacePath: '/profiles/a/workspaces/workspace-a' },
      { profileId: 'profile-b', workspaceId: 'shared', workspacePath: '/profiles/b/workspaces/shared' },
    ], true);

    expect(result.deleted).toBe(2);
    expect(dockerDelete).toHaveBeenCalledTimes(1);
    expect(dockerDelete).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'gone' }));
    expect(appleDelete).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'apple-gone' }));
  });


  it('cancels a pending orphan deletion when its workspace is restored', async () => {
    const deleteOwned = vi.fn(async () => { throw new Error('daemon unavailable'); });
    const listOwned = vi.fn(async () => [{
      provider: 'docker' as const,
      containerId: 'restored',
      workspaceId: identity.workspaceId,
      workspacePath: identity.workspacePath,
    }]);
    const service = new ContainerCleanupService(await statePath(), [
      provider('docker', deleteOwned, listOwned),
    ]);
    expect((await service.requestDeletion(identity, ['docker'])).pending).toBe(1);
    deleteOwned.mockClear();

    const result = await service.reconcile([identity], true);

    expect(result.pending).toBe(0);
    expect(deleteOwned).not.toHaveBeenCalled();
  });
  it('does not reconcile orphans when any profile registry is unreadable', async () => {
    const deleteOwned = vi.fn(async () => 'deleted' as const);
    const listOwned = vi.fn(async () => [
      { provider: 'docker' as const, containerId: 'unknown', workspaceId: 'unknown', workspacePath: '/unknown' },
    ]);
    const service = new ContainerCleanupService(await statePath(), [provider('docker', deleteOwned, listOwned)]);

    const result = await service.reconcile([], false);

    expect(result.registryComplete).toBe(false);
    expect(listOwned).not.toHaveBeenCalled();
    expect(deleteOwned).not.toHaveBeenCalled();
  });
});
