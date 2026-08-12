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
  parseAppleContainerOwnership,
  parseContainerTimestamp,
  type AppleContainerOwnership,
} from '@electron/features/container/core/ownership';
import { runDocker, type DockerRunner } from '../backends/docker/docker-cli';
import type {
  ContainerCleanupProvider,
  ContainerDeletionResult,
  OwnedWorkspaceContainer,
} from './types';

const execFileAsync = promisify(execFile);

interface DockerInspectData {
  Id?: string;
  Name?: string;
  Created?: string;
  State?: { Running?: boolean; StartedAt?: string };
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
  run: DockerRunner = runDocker,
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
      '--format', '{{.ID}}',
    ], { timeoutMs: 15_000 });
    if (listed.exitCode !== 0) {
      throw new Error(listed.stderr || listed.stdout || 'Docker container listing failed');
    }
    const containers: DockerInspectData[] = [];
    for (const id of listed.stdout.split('\n').map((value) => value.trim()).filter(Boolean)) {
      const inspected = await inspectNamed(id);
      if (inspected) containers.push(inspected);
    }
    return containers;
  };

  const toOwned = (
    inspect: DockerInspectData,
    profileRoots: string[],
  ): OwnedWorkspaceContainer | null => {
    const labels = inspect.Config?.Labels;
    if (labels?.[SERO_MANAGED_LABEL] !== 'true' || labels[SERO_RUNTIME_LABEL] !== 'docker') return null;
    const workspaceId = labels[SERO_WORKSPACE_ID_LABEL];
    const workspaceMount = inspect.Mounts?.find((mount) => mount.Destination === '/workspace');
    if (!workspaceId || !workspaceMount?.Source || !path.isAbsolute(workspaceMount.Source)) return null;
    const workspacePath = path.resolve(workspaceMount.Source);
    if (!belongsToCurrentInstallation(labels, workspacePath, profileRoots)) return null;
    return {
      provider: 'docker',
      containerId: (inspect.Name ?? inspect.Id ?? '').replace(/^\//, ''),
      workspaceId,
      workspacePath,
    };
  };

  return {
    provider: 'docker',
    async listOwned(profileRoots) {
      return (await listInspected()).flatMap((inspect) => {
        const owned = toOwned(inspect, profileRoots);
        return owned ? [owned] : [];
      });
    },
    async deleteOwned(request): Promise<ContainerDeletionResult> {
      const cid = containerId(request.workspaceId);
      const named = await inspectNamed(cid);
      if (!named) return 'absent';
      const labels = named.Config?.Labels;
      if (labels?.[SERO_MANAGED_LABEL] !== 'true'
        || labels[SERO_RUNTIME_LABEL] !== 'docker'
        || labels[SERO_WORKSPACE_ID_LABEL] !== request.workspaceId) return 'preserved';
      const installationRoot = labels[SERO_INSTALLATION_ROOT_LABEL];
      if (installationRoot && path.resolve(installationRoot) !== SERO_INSTALLATION_ROOT) return 'preserved';
      const workspaceMount = named.Mounts?.find((mount) => mount.Destination === '/workspace');
      if (!installationRoot && (!workspaceMount?.Source
        || path.resolve(workspaceMount.Source) !== path.resolve(request.workspacePath))) return 'preserved';
      const cutoffMs = parseCutoff(request.createdBefore);
      const startedAt = parseContainerTimestamp(named.State?.StartedAt);
      if (cutoffMs !== null
        && (isAfterCutoff(named.Created, cutoffMs)
          || isAfterCutoff(startedAt, cutoffMs))) return 'superseded';
      if (request.skipRunning && named.State?.Running === true
        && (cutoffMs === null || startedAt === null)) return 'preserved';
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
  const inspectNamed = async (cid: string): Promise<AppleContainerOwnership | null> => {
    try {
      const result = await run(['inspect', cid]);
      const ownership = parseAppleContainerOwnership(JSON.parse(result.stdout) as unknown, cid);
      return ownership.exists ? ownership : null;
    } catch (error) {
      if (isNotFound(error instanceof Error ? error.message : String(error))) return null;
      throw error;
    }
  };

  const listIds = async (): Promise<string[]> => {
    const result = await run(['list', '--all', '--format', 'json']);
    const parsed = JSON.parse(result.stdout || '[]') as unknown;
    if (!Array.isArray(parsed)) throw new Error('Unexpected Apple Container list output');
    return parsed.flatMap((value) => {
      if (!value || typeof value !== 'object') return [];
      const inspect = value as AppleInspectData;
      const id = inspect.configuration?.id ?? inspect.id;
      return id?.startsWith('sero-') ? [id] : [];
    });
  };

  const toOwned = (
    cid: string,
    ownership: AppleContainerOwnership,
    profileRoots: string[],
  ): OwnedWorkspaceContainer | null => {
    const workspacePath = ownership.workspaceMountSource;
    if (!workspacePath) return null;
    if (ownership.installationRoot) {
      if (ownership.installationRoot !== SERO_INSTALLATION_ROOT || !ownership.identity) return null;
      return { provider: 'apple-container', containerId: cid, ...ownership.identity, workspacePath };
    }
    if (!isWithinProfileRoot(workspacePath, profileRoots)) return null;
    const workspaceId = ownership.identity?.workspaceId
      ?? (cid.startsWith('sero-') ? cid.slice('sero-'.length) : '');
    if (!workspaceId) return null;
    return { provider: 'apple-container', containerId: cid, workspaceId, workspacePath };
  };

  return {
    provider: 'apple-container',
    async listOwned(profileRoots) {
      const owned: OwnedWorkspaceContainer[] = [];
      for (const cid of await listIds()) {
        const inspected = await inspectNamed(cid);
        if (!inspected) continue;
        const container = toOwned(cid, inspected, profileRoots);
        if (container) owned.push(container);
      }
      return owned;
    },
    async deleteOwned(request): Promise<ContainerDeletionResult> {
      const cid = containerId(request.workspaceId);
      const ownership = await inspectNamed(cid);
      if (!ownership) return 'absent';
      if (!appleContainerBelongsToWorkspace(ownership, request)) return 'preserved';
      const cutoffMs = parseCutoff(request.createdBefore);
      if (cutoffMs !== null && isAfterCutoff(ownership.startedAt, cutoffMs)) return 'superseded';
      if (request.skipRunning && ownership.running === true
        && (cutoffMs === null || ownership.startedAt === null)) return 'preserved';
      await run(['delete', '--force', cid]);
      return 'deleted';
    },
  };
}

function isNotFound(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('not found')
    || normalized.includes('no such container')
    || normalized.includes('no such object')
    || normalized.includes('does not exist');
}

function belongsToCurrentInstallation(
  labels: Record<string, string>,
  workspacePath: string,
  profileRoots: string[],
): boolean {
  const installationRoot = labels[SERO_INSTALLATION_ROOT_LABEL];
  return installationRoot
    ? path.resolve(installationRoot) === SERO_INSTALLATION_ROOT
    : isWithinProfileRoot(workspacePath, profileRoots);
}

function isWithinProfileRoot(workspacePath: string, profileRoots: string[]): boolean {
  return profileRoots.some((root) => {
    const relative = path.relative(path.resolve(root), path.resolve(workspacePath));
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
}

function parseCutoff(cutoff: string | undefined): number | null {
  if (!cutoff) return null;
  const cutoffMs = Date.parse(cutoff);
  return Number.isNaN(cutoffMs) ? null : cutoffMs;
}

function isAfterCutoff(observedAt: unknown, cutoffMs: number): boolean {
  const observedAtMs = typeof observedAt === 'number'
    ? observedAt
    : parseContainerTimestamp(observedAt);
  return observedAtMs !== null && observedAtMs > cutoffMs;
}
