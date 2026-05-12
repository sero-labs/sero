import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import type { ChildProcess } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostBackend } from '@electron/features/workspace/runtime/backends/host/host-backend';
import type { HostRuntimeSubstrate } from '@electron/features/workspace/runtime/backends/host/host-substrate';

const tempDirs: string[] = [];

async function createBackend(): Promise<{ backend: HostBackend; workspacePath: string }> {
  const workspacePath = await mkdtemp(path.join(os.tmpdir(), 'sero-host-backend-'));
  tempDirs.push(workspacePath);
  return {
    workspacePath,
    backend: new HostBackend({ workspaceId: 'workspace-a', hostWorkspacePath: workspacePath }),
  };
}

function createMockSubstrate(): HostRuntimeSubstrate {
  return {
    platform: 'linux',
    kind: 'posix',
    runtimeWorkspacePath: '/workspace',
    toExecutionPath: (nativePath) => nativePath,
    toNativeHostPath: (executionPath) => executionPath,
    isPathInsideRoot: (candidate, root) => candidate.startsWith(root),
    shellCommand: vi.fn((opts) => ({ program: 'mock-shell', args: [opts.command], nativeCwd: opts.cwd, env: opts.env })),
    execFileCommand: vi.fn((opts) => ({ program: opts.program, args: opts.args, nativeCwd: opts.cwd, env: opts.env })),
    terminalCommand: vi.fn((opts) => ({ program: 'mock-terminal', args: ['--login'], nativeCwd: opts.cwd, env: opts.env })),
    readFile: vi.fn().mockResolvedValue(Buffer.from('hello')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([{ name: 'file.txt', type: 'file' }]),
    stat: vi.fn().mockResolvedValue({ size: 5, mtimeMs: 0, type: 'file' }),
    rename: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    watchFiles: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
    isSshAvailable: vi.fn().mockResolvedValue(false),
    signalChild: vi.fn((_child: ChildProcess) => Promise.resolve()),
    normalizeExecOutput: (output) => output,
  };
}

describe('HostBackend', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('translates /workspace paths for file read and write operations', async () => {
    const { backend, workspacePath } = await createBackend();

    expect(backend.backend).toBe('host');
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

  it('reads validated additional-root host paths in host mode', async () => {
    const { workspacePath } = await createBackend();
    const extraRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-host-extra-'));
    tempDirs.push(extraRoot);
    await writeFile(path.join(extraRoot, 'note.txt'), 'extra', 'utf8');

    const backend = new HostBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: workspacePath,
      workspaceManager: {
        getRoots: async () => [{ id: 'extra', name: 'Extra', path: extraRoot }],
      },
    });

    await expect(backend.readFile({ path: path.join(extraRoot, 'note.txt') })).resolves.toEqual({
      content: 'extra',
      encoding: 'utf8',
    });
    await backend.writeFile({ path: path.join(extraRoot, 'new.txt'), content: 'new' });
    const entries = await backend.listFiles({ path: extraRoot });

    expect(entries.map((entry) => entry.path)).toContain(path.join(extraRoot, 'new.txt'));
    await expect(backend.readFile({ path: `${extraRoot}-sibling/file.txt` })).rejects.toThrow(
      'Host path must be inside a workspace root',
    );
  });

  it('rejects paths outside the virtual workspace root', async () => {
    const { backend } = await createBackend();

    await expect(backend.readFile({ path: '/tmp/outside.txt' })).rejects.toThrow(
      'Host path must be inside a workspace root',
    );
  });

  it('delegates file operations through substrate primitives', async () => {
    const substrate = createMockSubstrate();
    const backend = new HostBackend({
      workspaceId: 'workspace-a',
      hostWorkspacePath: '/home/me/repo',
      substrate,
    });

    await expect(backend.readFile({ path: '/workspace/file.txt' })).resolves.toEqual({ content: 'hello', encoding: 'utf8' });
    await backend.writeFile({ path: '/workspace/file.txt', content: 'updated' });
    await expect(backend.listFiles({ path: '/workspace' })).resolves.toEqual([
      { name: 'file.txt', path: '/workspace/file.txt', type: 'file', size: 5 },
    ]);
    await backend.rename({ oldPath: '/workspace/file.txt', newPath: '/workspace/renamed.txt' });
    await backend.delete({ path: '/workspace/renamed.txt' });
    await backend.createDirectory({ path: '/workspace/src', recursive: true });
    const watcher = await backend.watchFiles({ paths: ['/workspace'] });
    await watcher.close();

    expect(substrate.readFile).toHaveBeenCalledWith(expect.stringContaining('file.txt'));
    expect(substrate.writeFile).toHaveBeenCalledWith(expect.stringContaining('file.txt'), Buffer.from('updated'));
    expect(substrate.listFiles).toHaveBeenCalled();
    expect(substrate.stat).toHaveBeenCalled();
    expect(substrate.rename).toHaveBeenCalled();
    expect(substrate.delete).toHaveBeenCalled();
    expect(substrate.createDirectory).toHaveBeenCalledWith(expect.stringContaining('src'), { recursive: true });
    expect(substrate.watchFiles).toHaveBeenCalled();
  });
});
