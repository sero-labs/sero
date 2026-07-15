import { promises as fs } from 'fs';
import path from 'path';
import { pathExists } from './registry-recovery';
import { ensureUniqueId } from './utils';

async function isEmptyOrMissing(directoryPath: string): Promise<boolean> {
  if (!await pathExists(directoryPath)) return true;
  const destination = await fs.stat(directoryPath);
  return destination.isDirectory() && (await fs.readdir(directoryPath)).length === 0;
}

export async function resolveWorkspaceCreateDestination({
  baseId,
  parentPath,
  workspacesDir,
  registeredIds,
  requireEmpty,
}: {
  baseId: string;
  parentPath?: string;
  workspacesDir: string;
  registeredIds: Set<string>;
  requireEmpty: boolean;
}): Promise<{ id: string; path: string }> {
  let id = ensureUniqueId(baseId, registeredIds);
  let workspacePath = path.join(parentPath ? path.resolve(parentPath) : workspacesDir, id);

  while (requireEmpty && !await isEmptyOrMissing(workspacePath)) {
    registeredIds.add(id);
    id = ensureUniqueId(baseId, registeredIds);
    workspacePath = path.join(parentPath ? path.resolve(parentPath) : workspacesDir, id);
  }

  return { id, path: workspacePath };
}
