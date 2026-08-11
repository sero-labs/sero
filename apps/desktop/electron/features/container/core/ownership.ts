import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { SERO_FIXED_ROOT } from '@electron/platform/env';
import { CONTAINER_BIN, errorMessage, WORKSPACE_MOUNT } from './types';

const execFileAsync = promisify(execFile);

interface AppleInspectData {
  status?: string | { state?: string };
  startedDate?: string | number;
  configuration?: {
    labels?: Record<string, string>;
    mounts?: Array<{ source?: string; destination?: string }>;
  };
}

export type SeroContainerProvider = 'apple-container' | 'docker';

export const SERO_MANAGED_LABEL = 'ai.sero.managed';
export const SERO_RUNTIME_LABEL = 'ai.sero.runtime';
export const SERO_WORKSPACE_ID_LABEL = 'ai.sero.workspaceId';
export const SERO_WORKSPACE_PATH_LABEL = 'ai.sero.workspacePath';
export const SERO_INSTALLATION_ROOT_LABEL = 'ai.sero.installationRoot';
export const SERO_INSTALLATION_ROOT = path.resolve(SERO_FIXED_ROOT);

export interface SeroContainerIdentity {
  workspaceId: string;
  workspacePath: string;
}

export function seroOwnershipLabels(
  provider: SeroContainerProvider,
  identity: SeroContainerIdentity,
): Record<string, string> {
  return {
    [SERO_MANAGED_LABEL]: 'true',
    [SERO_RUNTIME_LABEL]: provider,
    [SERO_WORKSPACE_ID_LABEL]: identity.workspaceId,
    [SERO_WORKSPACE_PATH_LABEL]: path.resolve(identity.workspacePath),
    [SERO_INSTALLATION_ROOT_LABEL]: SERO_INSTALLATION_ROOT,
  };
}

export function readSeroContainerIdentity(
  provider: SeroContainerProvider,
  labels: Record<string, string> | undefined,
): SeroContainerIdentity | null {
  if (!labels) return null;
  if (labels[SERO_MANAGED_LABEL] !== 'true') return null;
  if (labels[SERO_RUNTIME_LABEL] !== provider) return null;
  const workspaceId = labels[SERO_WORKSPACE_ID_LABEL];
  const workspacePath = labels[SERO_WORKSPACE_PATH_LABEL];
  if (!workspaceId || !workspacePath || !path.isAbsolute(workspacePath)) return null;
  return { workspaceId, workspacePath: path.resolve(workspacePath) };
}

export function identitiesMatch(
  left: SeroContainerIdentity,
  right: SeroContainerIdentity,
): boolean {
  return left.workspaceId === right.workspaceId
    && path.resolve(left.workspacePath) === path.resolve(right.workspacePath);
}

export interface AppleContainerOwnership {
  exists: boolean;
  identity: SeroContainerIdentity | null;
  installationRoot: string | null;
  workspaceMountSource: string | null;
  running: boolean | null;
  startedAt: number | null;
}

export function labelsBelongToCurrentInstallation(
  labels: Record<string, string> | undefined,
): boolean {
  return labels?.[SERO_INSTALLATION_ROOT_LABEL] === SERO_INSTALLATION_ROOT;
}

export function appleContainerBelongsToWorkspace(
  ownership: AppleContainerOwnership,
  expected: SeroContainerIdentity,
): boolean {
  if (!ownership.exists) return false;
  if (ownership.installationRoot && ownership.installationRoot !== SERO_INSTALLATION_ROOT) return false;
  if (ownership.identity) return ownership.identity.workspaceId === expected.workspaceId;
  return ownership.workspaceMountSource !== null
    && path.resolve(ownership.workspaceMountSource) === path.resolve(expected.workspacePath);
}

export function appleContainerHasCurrentIdentity(
  ownership: AppleContainerOwnership,
  expected: SeroContainerIdentity,
): boolean {
  return ownership.installationRoot === SERO_INSTALLATION_ROOT
    && ownership.identity !== null
    && identitiesMatch(ownership.identity, expected);
}

export function shouldRecreateAppleContainer(
  ownership: AppleContainerOwnership,
  expected: SeroContainerIdentity,
): boolean {
  return appleContainerBelongsToWorkspace(ownership, expected)
    && !appleContainerHasCurrentIdentity(ownership, expected)
    && ownership.running === false;
}

export function parseContainerCreationTime(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value > 1_000_000_000_000) return value;
  if (value >= 1_000_000_000) return value * 1_000;
  return (value + 978_307_200) * 1_000;
}

export function parseAppleContainerOwnership(raw: unknown, cid: string): AppleContainerOwnership {
  const info = (Array.isArray(raw) ? raw[0] : raw) as AppleInspectData | undefined;
  if (!info || typeof info !== 'object') throw new Error(`Unexpected inspect output for ${cid}`);
  const labels = info.configuration?.labels;
  const workspaceMount = info.configuration?.mounts?.find((mount) => mount.destination === WORKSPACE_MOUNT);
  const status = typeof info.status === 'string' ? info.status : info.status?.state;
  return {
    exists: true,
    identity: readSeroContainerIdentity('apple-container', labels),
    installationRoot: labels?.[SERO_INSTALLATION_ROOT_LABEL]
      ? path.resolve(labels[SERO_INSTALLATION_ROOT_LABEL])
      : null,
    workspaceMountSource: workspaceMount?.source && path.isAbsolute(workspaceMount.source)
      ? path.resolve(workspaceMount.source)
      : null,
    running: status ? status === 'running' : null,
    startedAt: parseContainerCreationTime(info.startedDate),
  };
}

export async function inspectAppleContainerOwnership(
  cid: string,
): Promise<AppleContainerOwnership> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['inspect', cid], { timeout: 10_000 });
    return parseAppleContainerOwnership(JSON.parse(stdout) as unknown, cid);
  } catch (error) {
    const message = errorMessage(error).toLowerCase();
    if (message.includes('not found') || message.includes('no such container') || message.includes('does not exist')) {
      return {
        exists: false,
        identity: null,
        installationRoot: null,
        workspaceMountSource: null,
        running: null,
        startedAt: null,
      };
    }
    throw error;
  }
}
