import { describe, expect, it, vi } from 'vitest';
const dockerCliMocks = vi.hoisted(() => ({
  checkDocker: vi.fn(),
  runDocker: vi.fn(),
}));

vi.mock(
  '@electron/features/workspace/runtime/backends/docker/docker-cli',
  () => dockerCliMocks,
);

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
  it('reports a missing Docker container as absent through the default runner', async () => {
    dockerCliMocks.runDocker.mockResolvedValueOnce({
      stdout: '',
      stderr: 'Error: No such object: sero-workspace-a',
      exitCode: 1,
    });

    await expect(createDockerCleanupProvider().deleteOwned(identity)).resolves.toBe('absent');
    expect(dockerCliMocks.runDocker).toHaveBeenCalledWith(
      ['inspect', 'sero-workspace-a'],
      { timeoutMs: 10_000 },
    );
  });

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
    await expect(createDockerCleanupProvider(run).listOwned([])).resolves.toEqual([]);
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['rm']), expect.anything());
  });

  it('discovers legacy Docker containers inside a registered profile root', async () => {
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

    await expect(createDockerCleanupProvider(run).listOwned(['/profiles/work'])).resolves.toEqual([
      expect.objectContaining(identity),
    ]);
  });

  it('does not delete a Docker container created after a shutdown entry', async () => {
    const run = dockerRunnerFor({
      Id: 'new-container',
      Name: '/sero-workspace-a',
      Created: '2026-08-12T00:00:00.000Z',
      Config: { Labels: {
        [SERO_MANAGED_LABEL]: 'true',
        [SERO_RUNTIME_LABEL]: 'docker',
        [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
        [SERO_INSTALLATION_ROOT_LABEL]: SERO_INSTALLATION_ROOT,
      } },
      Mounts: [{ Source: identity.workspacePath, Destination: '/workspace' }],
    });

    await expect(createDockerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
    })).resolves.toBe('superseded');
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['rm']), expect.anything());
  });

  it('deletes a running Docker container from the shutdown that queued it', async () => {
    const run = dockerRunnerFor({
      Id: 'container-id',
      Name: '/sero-workspace-a',
      Created: '2026-08-11T22:00:00.000Z',
      State: { Running: true, StartedAt: '2026-08-11T22:00:00.000Z' },
      Config: { Labels: {
        [SERO_MANAGED_LABEL]: 'true',
        [SERO_RUNTIME_LABEL]: 'docker',
        [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
        [SERO_INSTALLATION_ROOT_LABEL]: SERO_INSTALLATION_ROOT,
      } },
      Mounts: [{ Source: identity.workspacePath, Destination: '/workspace' }],
    });

    await expect(createDockerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
      skipRunning: true,
    })).resolves.toBe('deleted');
    expect(run).toHaveBeenCalledWith(['rm', '-f', 'sero-workspace-a'], { timeoutMs: 30_000 });
  });

  it('preserves a running Docker container when its start time is unknown', async () => {
    const run = dockerRunnerFor({
      Id: 'container-id',
      Name: '/sero-workspace-a',
      State: { Running: true },
      Config: { Labels: {
        [SERO_MANAGED_LABEL]: 'true',
        [SERO_RUNTIME_LABEL]: 'docker',
        [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
        [SERO_INSTALLATION_ROOT_LABEL]: SERO_INSTALLATION_ROOT,
      } },
      Mounts: [{ Source: identity.workspacePath, Destination: '/workspace' }],
    });

    await expect(createDockerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
      skipRunning: true,
    })).resolves.toBe('preserved');
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['rm']), expect.anything());
  });

  it('reports a missing Apple container as absent', async () => {
    const run = vi.fn(async () => ({ stdout: '[]' }));

    await expect(createAppleContainerCleanupProvider(run).deleteOwned(identity)).resolves.toBe('absent');
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

  it('inspects Apple list summaries before discovering legacy containers', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === 'list') {
        return { stdout: JSON.stringify([{ id: 'sero-workspace-a' }]) };
      }
      return {
        stdout: JSON.stringify([{
          id: 'sero-workspace-a',
          configuration: {
            id: 'sero-workspace-a',
            mounts: [{ source: identity.workspacePath, destination: '/workspace' }],
          },
        }]),
      };
    });

    await expect(createAppleContainerCleanupProvider(run).listOwned(['/profiles/work'])).resolves.toEqual([
      expect.objectContaining(identity),
    ]);
    expect(run).toHaveBeenCalledWith(['inspect', 'sero-workspace-a']);
  });

  it('does not inspect Apple containers outside the Sero name prefix', async () => {
    const run = vi.fn(async (args: string[]) => {
      if (args[0] === 'list') return { stdout: JSON.stringify([{ id: 'unrelated' }]) };
      throw new Error(`Unexpected inspect: ${args.join(' ')}`);
    });

    await expect(createAppleContainerCleanupProvider(run).listOwned(['/profiles/work'])).resolves.toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not delete an Apple container started after a shutdown entry', async () => {
    const run = appleRunnerFor({
      startedDate: '2026-08-12T00:00:00.000Z',
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

    await expect(createAppleContainerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
    })).resolves.toBe('superseded');
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['delete']));
  });

  it('deletes an owned Apple container when creation time is unavailable', async () => {
    const run = appleRunnerFor({
      status: 'stopped',
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

    await expect(createAppleContainerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
    })).resolves.toBe('deleted');
    expect(run).toHaveBeenCalledWith(['delete', '--force', 'sero-workspace-a']);
  });

  it('deletes a running Apple container from the shutdown that queued it', async () => {
    const run = appleRunnerFor({
      status: 'running',
      startedDate: '2026-08-11T22:00:00.000Z',
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

    await expect(createAppleContainerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
      skipRunning: true,
    })).resolves.toBe('deleted');
    expect(run).toHaveBeenCalledWith(['delete', '--force', 'sero-workspace-a']);
  });

  it('preserves a running Apple container when its start time is unknown', async () => {
    const run = appleRunnerFor({
      status: 'running',
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

    await expect(createAppleContainerCleanupProvider(run).deleteOwned({
      ...identity,
      createdBefore: '2026-08-11T23:00:00.000Z',
      skipRunning: true,
    })).resolves.toBe('preserved');
    expect(run).not.toHaveBeenCalledWith(expect.arrayContaining(['delete']));
  });
});

function appleRunnerFor(inspect: unknown) {
  return vi.fn(async (args: string[]) => ({
    stdout: args[0] === 'delete' ? '' : JSON.stringify([inspect]),
  }));
}
