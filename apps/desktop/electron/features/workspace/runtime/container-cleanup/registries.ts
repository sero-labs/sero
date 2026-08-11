import { promises as fs } from 'fs';
import path from 'path';
import type { ProfileInfo } from '@/types/profile';
import type { WorkspaceContainerIdentity } from './types';

interface WorkspaceRegistryFile {
  workspaces?: unknown;
}

export interface RegisteredWorkspaceReadResult {
  workspaces: WorkspaceContainerIdentity[];
  complete: boolean;
}

export async function readProfileWorkspaceIdentities(
  profile: Pick<ProfileInfo, 'id' | 'path'>,
): Promise<RegisteredWorkspaceReadResult> {
  const registryPath = path.join(profile.path, 'agent', 'workspaces.json');
  let raw: string;
  try {
    raw = await fs.readFile(registryPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { workspaces: [], complete: true };
    }
    console.warn(`[container-cleanup] Could not read workspace registry ${registryPath}:`, error);
    return { workspaces: [], complete: false };
  }

  try {
    const parsed = JSON.parse(raw) as WorkspaceRegistryFile;
    if (!parsed || !Array.isArray(parsed.workspaces)) {
      return { workspaces: [], complete: false };
    }
    const workspaces: WorkspaceContainerIdentity[] = [];
    for (const value of parsed.workspaces) {
      if (!value || typeof value !== 'object') return { workspaces: [], complete: false };
      const entry = value as { id?: unknown; path?: unknown };
      if (typeof entry.id !== 'string' || typeof entry.path !== 'string' || !path.isAbsolute(entry.path)) {
        return { workspaces: [], complete: false };
      }
      workspaces.push({
        profileId: profile.id,
        workspaceId: entry.id,
        workspacePath: path.resolve(entry.path),
      });
    }
    return { workspaces, complete: true };
  } catch (error) {
    console.warn(`[container-cleanup] Invalid workspace registry ${registryPath}:`, error);
    return { workspaces: [], complete: false };
  }
}

export async function readRegisteredWorkspaceIdentities(
  profiles: Array<Pick<ProfileInfo, 'id' | 'path'>>,
): Promise<RegisteredWorkspaceReadResult> {
  const results = await Promise.all(profiles.map((profile) => readProfileWorkspaceIdentities(profile)));
  return {
    workspaces: results.flatMap((result) => result.workspaces),
    complete: results.every((result) => result.complete),
  };
}
