/**
 * Disk I/O helpers for workspace state — the per-workspace config file and
 * the persisted editor state. Extracted from WorkspaceManager to keep it
 * under the file-size budget.
 */

import { promises as fs } from 'fs';
import path from 'path';

import type { WorkspaceConfig } from '@/types/ipc';
import { normalizeWorkspaceConfigForWrite } from './runtime/config';

/** Read .sero-workspace.json from a workspace directory. */
export async function readWorkspaceConfig(workspacePath: string): Promise<WorkspaceConfig | null> {
  try {
    const raw = await fs.readFile(path.join(workspacePath, '.sero-workspace.json'), 'utf8');
    return JSON.parse(raw) as WorkspaceConfig;
  } catch {
    return null;
  }
}

/** Write .sero-workspace.json to a workspace directory. */
export async function writeWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): Promise<void> {
  const json = JSON.stringify(normalizeWorkspaceConfigForWrite(config), null, 2) + '\n';
  await fs.writeFile(path.join(workspacePath, '.sero-workspace.json'), json, 'utf8');
}

/** Remove a workspace's persisted editor state. Best-effort — never throws on a missing file. */
export async function cleanupEditorState(editorStateDir: string, id: string): Promise<void> {
  try {
    await fs.rm(path.join(editorStateDir, `${id}.json`), { force: true });
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') return;
    console.warn(`[workspace] Failed to remove editor state for ${id}:`, error);
  }
}
