import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { CONTAINER_BIN, errorMessage } from './types';

const execFileAsync = promisify(execFile);

interface AppleInspectData {
  configuration?: { labels?: Record<string, string> };
}

export type SeroContainerProvider = 'apple-container' | 'docker';

export const SERO_MANAGED_LABEL = 'ai.sero.managed';
export const SERO_RUNTIME_LABEL = 'ai.sero.runtime';
export const SERO_WORKSPACE_ID_LABEL = 'ai.sero.workspaceId';
export const SERO_WORKSPACE_PATH_LABEL = 'ai.sero.workspacePath';

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

export async function inspectAppleContainerOwnership(
  cid: string,
): Promise<{ exists: boolean; identity: SeroContainerIdentity | null }> {
  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['inspect', cid], { timeout: 10_000 });
    const raw = JSON.parse(stdout) as unknown;
    const info = (Array.isArray(raw) ? raw[0] : raw) as AppleInspectData | undefined;
    if (!info || typeof info !== 'object') throw new Error(`Unexpected inspect output for ${cid}`);
    return {
      exists: true,
      identity: readSeroContainerIdentity('apple-container', info.configuration?.labels),
    };
  } catch (error) {
    const message = errorMessage(error).toLowerCase();
    if (message.includes('not found') || message.includes('no such container') || message.includes('does not exist')) {
      return { exists: false, identity: null };
    }
    throw error;
  }
}
