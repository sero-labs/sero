import { describe, expect, it, vi } from 'vitest';
import {
  createAppleContainerCleanupProvider,
  createDockerCleanupProvider,
} from '@electron/features/workspace/runtime/container-cleanup/providers';
import {
  SERO_INSTALLATION_ROOT,
  SERO_INSTALLATION_ROOT_LABEL,
  SERO_MANAGED_LABEL,
  SERO_RUNTIME_LABEL,
  SERO_WORKSPACE_ID_LABEL,
  SERO_WORKSPACE_PATH_LABEL,
} from '@electron/features/container/core/ownership';
import type { DockerRunner } from '@electron/features/workspace/runtime/backends/docker/docker-cli';

const identity = { workspaceId: 'workspace-a', workspacePath: '/profiles/work/workspaces/a' };

function dockerRunnerFor(inspect: unknown | null): DockerRunner {
  return vi.fn(async (args: string[]) => {
    if (args[0] === 'ps') {
      return { stdout: inspect ? 'container-id\n' : '', stderr: '', exitCode: 0 };
    }
    if (args[0] === 'inspect') {
      return inspect
        ? { stdout: JSON.stringify([inspect]), stderr: '', exitCode: 0 }
        : { stdout: '', stderr: 'No such container', exitCode: 1 };
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  });
}

describe('container cleanup provider ownership', () => {
  it('deletes a Docker container only when Sero labels and workspace mount agree', async () => {
    const run = dockerRunnerFor({
      Id: 'container-id',
      Name: '/sero-workspace-a',
      Config: { Labels: {
        [SERO_MANAGED_LABEL]: 'true',
        [SERO_RUNTIME_LABEL]: 'docker',
        [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
      } },
      Mounts: [{ Source: identity.workspacePath, Destination: '/workspace' }],
    });

    await expect(createDockerCleanupProvider(run).deleteOwned(identity)).resolves.toBe('deleted');
    expect(run).toHaveBeenCalledWith(['rm', '-f', 'sero-workspace-a'], { timeoutMs: 30_000 });
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['ps']), expect.anything());
  });

  it('preserves a Docker ownership collision with a different workspace path', async () => {
    const run = dockerRunnerFor({
      Id: 'container-id',
      Name: '/sero-workspace-a',
      Config: { Labels: {
        [SERO_MANAGED_LABEL]: 'true',
        [SERO_RUNTIME_LABEL]: 'docker',
        [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
      } },
      Mounts: [{ Source: '/profiles/other/workspaces/a', Destination: '/workspace' }],
    });

    await expect(createDockerCleanupProvider(run).deleteOwned(identity)).resolves.toBe('preserved');
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['rm']), expect.anything());
  });

  it('preserves Docker containers owned by another Sero installation', async () => {
    const run = dockerRunnerFor({
      Name: '/sero-workspace-a',
      Config: { Labels: {
        [SERO_MANAGED_LABEL]: 'true',
        [SERO_RUNTIME_LABEL]: 'docker',
        [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
        [SERO_INSTALLATION_ROOT_LABEL]: '/sero/other',
      } },
      Mounts: [{ Source: identity.workspacePath, Destination: '/workspace' }],
    });

    await expect(createDockerCleanupProvider(run).deleteOwned(identity)).resolves.toBe('preserved');
    await expect(createDockerCleanupProvider(run).listOwned()).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['rm']), expect.anything());
  });

  it('deletes Apple Container records with durable Sero ownership labels', async () => {
    const run = appleRunnerFor({
      configuration: {
        id: 'sero-workspace-a',
        labels: {
          [SERO_MANAGED_LABEL]: 'true',
          [SERO_RUNTIME_LABEL]: 'apple-container',
          [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
          [SERO_WORKSPACE_PATH_LABEL]: identity.workspacePath,
          [SERO_INSTALLATION_ROOT_LABEL]: SERO_INSTALLATION_ROOT,
        },
        mounts: [{ source: identity.workspacePath, destination: '/workspace' }],
      },
    });

    await expect(createAppleContainerCleanupProvider(run).deleteOwned(identity)).resolves.toBe('deleted');
    expect(run).toHaveBeenCalledWith(['delete', '--force', 'sero-workspace-a']);
  });

  it('deletes a legacy Apple Container only when its deterministic mount agrees', async () => {
    const matching = appleRunnerFor({
      configuration: {
        id: 'sero-workspace-a',
        labels: {},
        mounts: [{ source: identity.workspacePath, destination: '/workspace' }],
      },
    });
    const collision = appleRunnerFor({
      configuration: {
        id: 'sero-workspace-a',
        labels: {},
        mounts: [{ source: '/profiles/other/workspace-a', destination: '/workspace' }],
      },
    });

    await expect(createAppleContainerCleanupProvider(matching).deleteOwned(identity)).resolves.toBe('deleted');
    await expect(createAppleContainerCleanupProvider(collision).deleteOwned(identity)).resolves.toBe('preserved');
    expect(collision).not.toHaveBeenCalledWith(expect.arrayContaining(['delete']));
  });
});

function appleRunnerFor(inspect: unknown) {
  return vi.fn(async (args: string[]) => ({
    stdout: args[0] === 'delete' ? '' : JSON.stringify([inspect]),
  }));
}
