import { promises as fs } from 'fs';
import path from 'path';

import type { WorkspaceConfig, WorkspaceRegistryEntry } from '@/types/ipc';
import { isSafeWorkspaceId } from './utils';

export function pathExists(targetPath: string): Promise<boolean> {
  return fs.access(targetPath).then(() => true, () => false);
}

export async function discoverManagedWorkspaceEntries(
  workspacesDir: string,
  existing: WorkspaceRegistryEntry[],
): Promise<WorkspaceRegistryEntry[]> {
  const knownIds = new Set(existing.map((entry) => entry.id));
  const knownPaths = new Set(existing.map((entry) => path.resolve(entry.path)));
  const dirents = await fs.readdir(workspacesDir, { withFileTypes: true }).catch(() => []);
  const candidates = await Promise.all(dirents.map(async (dirent) => {
    if (!dirent.isDirectory()) return null;
    const workspacePath = path.join(workspacesDir, dirent.name);
    if (knownPaths.has(path.resolve(workspacePath))) return null;
    const config = await readWorkspaceConfig(workspacePath);
    if (!isSafeWorkspaceId(config?.id)) return null;
    return { id: config.id, path: workspacePath, open: true };
  }));

  return candidates.filter((entry): entry is WorkspaceRegistryEntry => {
    if (!entry || knownIds.has(entry.id) || knownPaths.has(path.resolve(entry.path))) return false;
    knownIds.add(entry.id);
    knownPaths.add(path.resolve(entry.path));
    return true;
  });
}

async function readWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig | null> {
  try {
    const raw = await fs.readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    return JSON.parse(raw) as WorkspaceConfig;
  } catch {
    return null;
  }
}
