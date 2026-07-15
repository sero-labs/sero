import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceManager } from '@electron/features/workspace/manager';

const tempDirs: string[] = [];

async function createTestManager(): Promise<{ manager: WorkspaceManager; workspacesDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sero-workspace-create-'));
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

describe('workspace creation destinations', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('uses a new clone destination instead of modifying a non-empty directory', async () => {
    const { manager, workspacesDir } = await createTestManager();
    const destination = path.join(workspacesDir, 'existing-repo');
    await mkdir(destination);
    await writeFile(path.join(destination, 'keep.txt'), 'keep me', 'utf8');

    const workspace = await manager.create('Existing Repo', undefined, { requireEmpty: true });

    expect(workspace.id).toBe('existing-repo-2');
    expect(await readFile(path.join(destination, 'keep.txt'), 'utf8')).toBe('keep me');
    expect(await readdir(destination)).toEqual(['keep.txt']);
    expect(await readdir(path.join(workspacesDir, 'existing-repo-2'))).toContain('.sero-workspace.json');
  });

  it('allows an existing empty clone destination', async () => {
    const { manager, workspacesDir } = await createTestManager();
    await mkdir(path.join(workspacesDir, 'empty-repo'));

    const workspace = await manager.create('Empty Repo', undefined, { requireEmpty: true });

    expect(workspace.id).toBe('empty-repo');
    expect(await readdir(path.join(workspacesDir, 'empty-repo'))).toContain('.sero-workspace.json');
  });
});
