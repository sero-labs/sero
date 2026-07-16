import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { existsSync, promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceManager } from '@electron/features/workspace/manager';

const tempDirs: string[] = [];

async function createTestManager(): Promise<{ manager: WorkspaceManager; workspacesDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-delete-'));
  tempDirs.push(root);
  const agentDir = path.join(root, 'agent');
  const workspacesDir = path.join(root, 'workspaces');
  await Promise.all([
    mkdir(agentDir, { recursive: true }),
    mkdir(workspacesDir, { recursive: true }),
  ]);
  return {
    manager: new WorkspaceManager({
      agentDir,
      workspacesDir,
      registryPath: path.join(agentDir, 'workspaces.json'),
      editorStateDir: path.join(agentDir, 'editor-state'),
    }),
    workspacesDir,
  };
}

describe('workspace deletion', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('erases the folder from disk and unregisters the workspace', async () => {
    const { manager, workspacesDir } = await createTestManager();
    const workspace = await manager.create('Doomed');
    const workspacePath = path.join(workspacesDir, workspace.id);
    await writeFile(path.join(workspacePath, 'file.txt'), 'data', 'utf8');
    expect(existsSync(workspacePath)).toBe(true);

    await manager.delete(workspace.id);

    expect(existsSync(workspacePath)).toBe(false);
    expect((await manager.list()).some((w) => w.id === workspace.id)).toBe(false);
  });

  it('deletes external "Add Folder" workspaces too (real delete, per design)', async () => {
    const { manager } = await createTestManager();
    const external = await mkdtemp(path.join(os.tmpdir(), 'sero-external-'));
    tempDirs.push(external);
    await writeFile(path.join(external, 'keep.txt'), 'x', 'utf8');
    const workspace = await manager.addFolder(external);

    await manager.delete(workspace.id);

    expect(existsSync(external)).toBe(false);
  });

  it('unregisters the workspace even when file removal fails (no half-deleted ghost)', async () => {
    const { manager } = await createTestManager();
    const workspace = await manager.create('Busy');
    // Simulate a large/busy tree that fails to delete (e.g. EBUSY on node_modules).
    const spy = vi.spyOn(fsp, 'rm').mockRejectedValue(new Error('EBUSY: resource busy'));

    await expect(manager.delete(workspace.id)).rejects.toThrow(/EBUSY/);
    // Registry updated first → the workspace is gone from the sidebar regardless.
    expect((await manager.list()).some((w) => w.id === workspace.id)).toBe(false);

    spy.mockRestore();
  });

  it('refuses to delete the default workspace', async () => {
    const { manager } = await createTestManager();
    await expect(manager.delete('global')).rejects.toThrow(/default workspace/);
  });

  it('is a no-op for an unknown workspace id', async () => {
    const { manager } = await createTestManager();
    await expect(manager.delete('does-not-exist')).resolves.toBeUndefined();
  });
});
