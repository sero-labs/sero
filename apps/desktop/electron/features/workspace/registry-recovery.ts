import { promises as fs } from 'fs';
import path from 'path';

import type { WorkspaceConfig, WorkspaceRegistryEntry } from '@/types/ipc';

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function discoverManagedWorkspaceEntries(
  workspacesDir: string,
  existing: WorkspaceRegistryEntry[],
): Promise<WorkspaceRegistryEntry[]> {
  const knownIds = new Set(existing.map((entry) => entry.id));
  const knownPaths = new Set(existing.map((entry) => path.resolve(entry.path)));
  const dirents = await fs.readdir(workspacesDir, { withFileTypes: true }).catch(() => []);
  const recovered: WorkspaceRegistryEntry[] = [];

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const workspacePath = path.join(workspacesDir, dirent.name);
    if (knownPaths.has(path.resolve(workspacePath))) continue;
    const config = await readWorkspaceConfig(workspacePath);
    if (!config?.id || knownIds.has(config.id)) continue;
    recovered.push({ id: config.id, path: workspacePath, open: true });
    knownIds.add(config.id);
    knownPaths.add(path.resolve(workspacePath));
  }

  return recovered;
}

async function readWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig | null> {
  try {
    const raw = await fs.readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    return JSON.parse(raw) as WorkspaceConfig;
  } catch {
    return null;
  }
}
