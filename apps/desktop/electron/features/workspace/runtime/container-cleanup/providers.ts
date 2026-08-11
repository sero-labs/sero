import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { CONTAINER_BIN, containerId } from '@electron/features/container/core/types';
import {
  SERO_INSTALLATION_ROOT,
  SERO_INSTALLATION_ROOT_LABEL,
  SERO_MANAGED_LABEL,
  SERO_RUNTIME_LABEL,
  SERO_WORKSPACE_ID_LABEL,
  appleContainerBelongsToWorkspace,
  labelsBelongToCurrentInstallation,
  parseAppleContainerOwnership,
  readSeroContainerIdentity,
  type AppleContainerOwnership,
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
    mounts?: Array<{ source?: string; destination?: string }>;
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
  const inspectNamed = async (cid: string): Promise<DockerInspectData | null> => {
    const inspected = await run(['inspect', cid], { timeoutMs: 10_000 });
    if (inspected.exitCode !== 0) {
      if (isNotFound(inspected.stderr || inspected.stdout)) return null;
      throw new Error(inspected.stderr || inspected.stdout || `Docker container inspect failed for ${cid}`);
    }
    const parsed = JSON.parse(inspected.stdout) as unknown;
    const value = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!value || typeof value !== 'object') throw new Error(`Unexpected Docker inspect output for ${cid}`);
    return value as DockerInspectData;
  };

  const listInspected = async (): Promise<DockerInspectData[]> => {
    const listed = await run([
      'ps', '-a',
      '--filter', `label=${SERO_MANAGED_LABEL}=true`,
      '--filter', `label=${SERO_RUNTIME_LABEL}=docker`,
      '--filter', `label=${SERO_INSTALLATION_ROOT_LABEL}=${SERO_INSTALLATION_ROOT}`,
      '--format', '{{.ID}}',
    ], { timeoutMs: 15_000 });
    if (listed.exitCode !== 0) {
      throw new Error(listed.stderr || listed.stdout || 'Docker container listing failed');
    }

    const ids = listed.stdout.split('\n').map((id) => id.trim()).filter(Boolean);
    const containers: DockerInspectData[] = [];
    for (const id of ids) {
      const inspected = await inspectNamed(id);
      if (inspected) containers.push(inspected);
    }
    return containers;
  };

  const toOwned = (inspect: DockerInspectData): OwnedWorkspaceContainer | null => {
    const labels = inspect.Config?.Labels;
    if (!labelsBelongToCurrentInstallation(labels)) return null;
    if (labels?.[SERO_MANAGED_LABEL] !== 'true' || labels[SERO_RUNTIME_LABEL] !== 'docker') return null;
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
      const cid = containerId(identity.workspaceId);
      const named = await inspectNamed(cid);
      if (!named) return 'absent';
      const labels = named.Config?.Labels;
      if (labels?.[SERO_MANAGED_LABEL] !== 'true'
        || labels[SERO_RUNTIME_LABEL] !== 'docker'
        || labels[SERO_WORKSPACE_ID_LABEL] !== identity.workspaceId) return 'preserved';
      const installationRoot = labels[SERO_INSTALLATION_ROOT_LABEL];
      if (installationRoot && path.resolve(installationRoot) !== SERO_INSTALLATION_ROOT) return 'preserved';
      const workspaceMount = named.Mounts?.find((mount) => mount.Destination === '/workspace');
      if (!installationRoot && (!workspaceMount?.Source
        || path.resolve(workspaceMount.Source) !== path.resolve(identity.workspacePath))) return 'preserved';
      const removed = await run(['rm', '-f', cid], { timeoutMs: 30_000 });
      if (removed.exitCode !== 0) {
        throw new Error(removed.stderr || removed.stdout || `Failed to remove Docker container ${cid}`);
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
    const labels = inspect.configuration?.labels;
    if (!labelsBelongToCurrentInstallation(labels)) return null;
    const identity = readSeroContainerIdentity('apple-container', labels);
    const id = inspect.configuration?.id ?? inspect.id;
    const workspaceMount = inspect.configuration?.mounts?.find((mount) => mount.destination === '/workspace');
    if (!identity || !id || !workspaceMount?.source
      || path.resolve(workspaceMount.source) !== path.resolve(identity.workspacePath)) return null;
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
      const cid = containerId(identity.workspaceId);
      let ownership: AppleContainerOwnership;
      try {
        const result = await run(['inspect', cid]);
        ownership = parseAppleContainerOwnership(JSON.parse(result.stdout) as unknown, cid);
      } catch (error) {
        if (isNotFound(error instanceof Error ? error.message : String(error))) return 'absent';
        throw error;
      }
      if (!appleContainerBelongsToWorkspace(ownership, identity)) return 'preserved';
      await run(['delete', '--force', cid]);
      return 'deleted';
    },
  };
}

function isNotFound(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('not found')
    || normalized.includes('no such container')
    || normalized.includes('does not exist');
}
