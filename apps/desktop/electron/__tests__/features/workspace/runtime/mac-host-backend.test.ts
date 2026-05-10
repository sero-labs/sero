import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { MacHostBackend } from '@electron/features/workspace/runtime/backends/mac-host-backend';

const tempDirs: string[] = [];

async function createBackend(): Promise<{ backend: MacHostBackend; workspacePath: string }> {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), 'sero-mac-host-backend-'));
  tempDirs.push(workspacePath);
  return {
    workspacePath,
    backend: new MacHostBackend({ workspaceId: 'workspace-a', hostWorkspacePath: workspacePath }),
  };
}

describe('MacHostBackend', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('translates /workspace paths for file read and write operations', async () => {
    const { backend, workspacePath } = await createBackend();

    await backend.writeFile({ path: '/workspace/src/App.tsx', content: 'hello' });
    const hostContent = await readFile(path.join(workspacePath, 'src', 'App.tsx'), 'utf8');
    const runtimeContent = await backend.readFile({ path: '/workspace/src/App.tsx' });

    expect(hostContent).toBe('hello');
    expect(runtimeContent).toEqual({ content: 'hello', encoding: 'utf8' });
  });

  it('lists and mutates files through translated runtime paths', async () => {
    const { backend, workspacePath } = await createBackend();
    await writeFile(path.join(workspacePath, 'old.txt'), 'old', 'utf8');

    await backend.createDirectory({ path: '/workspace/nested', recursive: true });
    await backend.createFile({ path: '/workspace/nested/new.txt', content: 'new', overwrite: false });
    await backend.rename({ oldPath: '/workspace/old.txt', newPath: '/workspace/nested/renamed.txt' });
    const entries = await backend.listFiles({ path: '/workspace', recursive: true });

    expect(entries.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      '/workspace/nested',
      '/workspace/nested/new.txt',
      '/workspace/nested/renamed.txt',
    ]));

    await backend.delete({ path: '/workspace/nested/new.txt' });
    await expect(readFile(path.join(workspacePath, 'nested', 'new.txt'), 'utf8')).rejects.toThrow();
  });

  it('runs commands from the translated cwd', async () => {
    const { backend } = await createBackend();
    await backend.writeFile({ path: '/workspace/package.json', content: '{"name":"demo"}' });

    const result = await backend.exec({ command: 'pwd && cat package.json', cwd: '/workspace' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('{"name":"demo"}');
  });

  it('rejects paths outside the virtual workspace root', async () => {
    const { backend } = await createBackend();

    await expect(backend.readFile({ path: '/tmp/outside.txt' })).rejects.toThrow(
      'Runtime path must be inside /workspace',
    );
  });
});
