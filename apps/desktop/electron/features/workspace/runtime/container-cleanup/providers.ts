import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { CONTAINER_BIN, containerId } from '@electron/features/container/core/types';
import {
  SERO_MANAGED_LABEL,
  SERO_RUNTIME_LABEL,
  SERO_WORKSPACE_ID_LABEL,
  identitiesMatch,
  readSeroContainerIdentity,
  type SeroContainerIdentity,
} from '@electron/features/container/core/ownership';
import { checkDocker, type DockerRunner } from '../backends/docker/docker-cli';
import type {
  ContainerCleanupProvider,
  ContainerDeletionResult,
  OwnedWorkspaceContainer,
} from './types';

const execFileAsync = promisify(execFile);

interface DockerInspectData {
  Id?: string;
  Name?: string;
  Config?: { Labels?: Record<string, string> };
  Mounts?: Array<{ Source?: string; Destination?: string }>;
}

interface AppleInspectData {
  id?: string;
  configuration?: {
    id?: string;
    labels?: Record<string, string>;
  };
}

export type AppleContainerRunner = (args: string[]) => Promise<{ stdout: string }>;

const runAppleContainer: AppleContainerRunner = async (args) => {
  const result = await execFileAsync(CONTAINER_BIN, args, { timeout: 15_000 });
  return { stdout: result.stdout };
};

export function createDockerCleanupProvider(
  run: DockerRunner = checkDocker,
): ContainerCleanupProvider {
  const listInspected = async (): Promise<DockerInspectData[]> => {
    const listed = await run([
      'ps', '-a',
      '--filter', `label=${SERO_MANAGED_LABEL}=true`,
      '--filter', `label=${SERO_RUNTIME_LABEL}=docker`,
      '--format', '{{.ID}}',
    ], { timeoutMs: 15_000 });
    if (listed.exitCode !== 0) {
      throw new Error(listed.stderr || listed.stdout || 'Docker container listing failed');
    }

    const ids = listed.stdout.split('\n').map((id) => id.trim()).filter(Boolean);
    const containers: DockerInspectData[] = [];
    for (const id of ids) {
      const inspected = await run(['inspect', id], { timeoutMs: 10_000 });
      if (inspected.exitCode !== 0) continue;
      const parsed = JSON.parse(inspected.stdout) as unknown;
      const value = Array.isArray(parsed) ? parsed[0] : parsed;
      if (value && typeof value === 'object') containers.push(value as DockerInspectData);
    }
    return containers;
  };

  const toOwned = (inspect: DockerInspectData): OwnedWorkspaceContainer | null => {
    const labels = inspect.Config?.Labels;
    if (labels?.[SERO_MANAGED_LABEL] !== 'true') return null;
    if (labels[SERO_RUNTIME_LABEL] !== 'docker') return null;
    const workspaceId = labels[SERO_WORKSPACE_ID_LABEL];
    const workspaceMount = inspect.Mounts?.find((mount) => mount.Destination === '/workspace');
    if (!workspaceId || !workspaceMount?.Source || !path.isAbsolute(workspaceMount.Source)) return null;
    return {
      provider: 'docker',
      containerId: (inspect.Name ?? inspect.Id ?? '').replace(/^\//, ''),
      workspaceId,
      workspacePath: path.resolve(workspaceMount.Source),
    };
  };

  return {
    provider: 'docker',
    async listOwned() {
      return (await listInspected()).flatMap((inspect) => {
        const owned = toOwned(inspect);
        return owned ? [owned] : [];
      });
    },
    async deleteOwned(identity): Promise<ContainerDeletionResult> {
      const candidates = await listInspected();
      const named = candidates.find((inspect) => {
        const name = (inspect.Name ?? '').replace(/^\//, '');
        return name === containerId(identity.workspaceId);
      });
      if (!named) return 'absent';
      const owned = toOwned(named);
      if (!owned || !identitiesMatch(owned, identity)) return 'preserved';
      const removed = await run(['rm', '-f', owned.containerId], { timeoutMs: 30_000 });
      if (removed.exitCode !== 0) {
        throw new Error(removed.stderr || removed.stdout || `Failed to remove Docker container ${owned.containerId}`);
      }
      return 'deleted';
    },
  };
}

export function createAppleContainerCleanupProvider(
  run: AppleContainerRunner = runAppleContainer,
): ContainerCleanupProvider {
  const listInspected = async (): Promise<AppleInspectData[]> => {
    const result = await run(['list', '--all', '--format', 'json']);
    const parsed = JSON.parse(result.stdout || '[]') as unknown;
    if (!Array.isArray(parsed)) throw new Error('Unexpected Apple Container list output');
    return parsed.filter((value): value is AppleInspectData => typeof value === 'object' && value !== null);
  };

  const toOwned = (inspect: AppleInspectData): OwnedWorkspaceContainer | null => {
    const identity = readSeroContainerIdentity('apple-container', inspect.configuration?.labels);
    const id = inspect.configuration?.id ?? inspect.id;
    if (!identity || !id) return null;
    return { provider: 'apple-container', containerId: id, ...identity };
  };

  return {
    provider: 'apple-container',
    async listOwned() {
      return (await listInspected()).flatMap((inspect) => {
        const owned = toOwned(inspect);
        return owned ? [owned] : [];
      });
    },
    async deleteOwned(identity: SeroContainerIdentity): Promise<ContainerDeletionResult> {
      const candidates = await listInspected();
      const named = candidates.find((inspect) =>
        (inspect.configuration?.id ?? inspect.id) === containerId(identity.workspaceId));
      if (!named) return 'absent';
      const owned = toOwned(named);
      if (!owned || !identitiesMatch(owned, identity)) return 'preserved';
      await run(['delete', '--force', owned.containerId]);
      return 'deleted';
    },
  };
}
