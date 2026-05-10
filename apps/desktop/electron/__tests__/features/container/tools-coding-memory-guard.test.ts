import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeBackend } from '@electron/features/workspace/runtime/types';
import { getRuntimeCapabilities } from '@electron/features/workspace/runtime/capabilities';
import { createBash, createEdit, createRead, createWrite } from '@electron/features/container/tools/tools-coding';
import {
  commandTouchesProtectedMemory,
  getProtectedMemoryRoot,
  getProtectedMemoryAccessError,
  isProtectedMemoryPath,
} from '@electron/features/container/tools/memory-file-guard';

type MockRuntimeBackend = RuntimeBackend & {
  exec: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
};

function createMockRuntimeBackend(): MockRuntimeBackend {
  return {
    backend: 'apple-container',
    workspaceId: 'ws-1',
    hostWorkspacePath: '/host/workspace',
    runtimeWorkspacePath: '/workspace',
    workspaceAccess: 'live-mount',
    capabilities: getRuntimeCapabilities('apple-container'),
    health: vi.fn().mockResolvedValue({ backend: 'apple-container', status: 'ready', message: 'ready' }),
    ensure: vi.fn().mockResolvedValue({ backend: 'apple-container', workspaceId: 'ws-1', hostWorkspacePath: '/host/workspace', runtimeWorkspacePath: '/workspace', state: 'running' }),
    destroy: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 }),
    spawn: vi.fn(),
    readFile: vi.fn().mockResolvedValue({ content: 'ok', encoding: 'utf8' }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    createFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    watchFiles: vi.fn(),
    createTerminal: vi.fn(),
    startDevServer: vi.fn(),
    stopDevServer: vi.fn().mockResolvedValue(undefined),
    restartDevServer: vi.fn(),
    getDevServerStatus: vi.fn().mockResolvedValue({ servers: [] }),
    forwardPort: vi.fn(),
    stopForward: vi.fn().mockResolvedValue(undefined),
    resolvePreviewUrl: vi.fn(),
  };
}

describe('container memory file guard', () => {
  const originalSeroHome = process.env.SERO_HOME;

  beforeEach(() => {
    process.env.SERO_HOME = '/tmp/sero-home';
  });

  afterEach(() => {
    process.env.SERO_HOME = originalSeroHome;
    vi.restoreAllMocks();
  });

  it('flags managed memory paths but not project files with the same names', () => {
    const protectedRoot = getProtectedMemoryRoot();

    expect(isProtectedMemoryPath(path.join(protectedRoot, 'MEMORY.md'))).toBe(true);
    expect(isProtectedMemoryPath(path.join(protectedRoot, 'SCRATCHPAD.md'))).toBe(true);
    expect(isProtectedMemoryPath(path.join(protectedRoot, 'memory', 'daily', '2026-04-02.md'))).toBe(true);
    expect(isProtectedMemoryPath(path.join(protectedRoot, 'memory', 'sessions', '2026-04-02-abcd1234.md'))).toBe(true);

    expect(isProtectedMemoryPath('/workspace/MEMORY.md')).toBe(false);
    expect(isProtectedMemoryPath('/workspace/memory/sessions/notes.md')).toBe(false);
  });

  it('detects direct and cwd-based bash access to protected memory locations', () => {
    const protectedRoot = getProtectedMemoryRoot();

    expect(commandTouchesProtectedMemory(`grep -n notifications '${protectedRoot}/MEMORY.md'`)).toBe(true);
    expect(commandTouchesProtectedMemory(`find '${protectedRoot}/memory/sessions' -type f`)).toBe(true);
    expect(commandTouchesProtectedMemory(`cd '${protectedRoot}' && cat *.md`)).toBe(true);
    expect(commandTouchesProtectedMemory('grep -n notifications /workspace/MEMORY.md')).toBe(false);
  });

  it('blocks read/write/edit tool calls against protected memory files', async () => {
    const cm = createMockRuntimeBackend();
    const protectedPath = `${getProtectedMemoryRoot()}/MEMORY.md`;

    const readTool = createRead(cm);
    const writeTool = createWrite(cm);
    const editTool = createEdit(cm);

    await expect(readTool.execute('tool-1', { path: protectedPath }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('read'));
    await expect(writeTool.execute('tool-2', { path: protectedPath, content: 'x' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('write'));
    await expect(editTool.execute('tool-3', { path: protectedPath, oldText: 'a', newText: 'b' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('edit'));

    expect(cm.exec).not.toHaveBeenCalled();
    expect(cm.writeFile).not.toHaveBeenCalled();
  });

  it('blocks bash commands that touch protected memory files before execution', async () => {
    const cm = createMockRuntimeBackend();
    const bashTool = createBash(cm);
    const protectedRoot = getProtectedMemoryRoot();

    await expect(bashTool.execute('tool-1', { command: `cat '${protectedRoot}/MEMORY.md'` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));
    await expect(bashTool.execute('tool-2', { command: `cd '${protectedRoot}' && cat *.md` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));

    expect(cm.exec).not.toHaveBeenCalled();
  });

  it('blocks symlinked protected paths inside the container tool wrappers', async () => {
    const protectedPath = `${getProtectedMemoryRoot()}/MEMORY.md`;
    const cm = createMockRuntimeBackend();
    cm.exec = vi.fn().mockResolvedValue({ stdout: `${protectedPath}\n`, stderr: '', exitCode: 0 });

    const readTool = createRead(cm);
    const writeTool = createWrite(cm);
    const editTool = createEdit(cm);
    const bashTool = createBash(cm);

    await expect(readTool.execute('tool-1', { path: 'memory-link' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('read'));
    await expect(writeTool.execute('tool-2', { path: 'memory-link', content: 'x' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('write'));
    await expect(editTool.execute('tool-3', { path: 'memory-link', oldText: 'a', newText: 'b' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('edit'));
    await expect(bashTool.execute('tool-4', { command: 'cat memory-link' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));

    expect(cm.writeFile).not.toHaveBeenCalled();
  });
});
