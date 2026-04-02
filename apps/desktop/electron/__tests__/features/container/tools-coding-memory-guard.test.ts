import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContainerManager } from '../../../features/container';
import { createBash, createEdit, createRead, createWrite } from '../../../features/container/tools/tools-coding';
import {
  commandTouchesProtectedMemory,
  getProtectedMemoryRoot,
  getProtectedMemoryAccessError,
  isProtectedMemoryPath,
} from '../../../features/container/tools/memory-file-guard';

type MockContainerManager = Pick<ContainerManager, 'exec' | 'writeFile'> & {
  portScanner: Pick<ContainerManager['portScanner'], 'getPorts' | 'triggerScan'>;
};

function createMockContainerManager(): MockContainerManager {
  return {
    exec: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0 }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    portScanner: {
      getPorts: vi.fn().mockReturnValue([]),
      triggerScan: vi.fn(),
    },
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
    const cm = createMockContainerManager();
    const protectedPath = `${getProtectedMemoryRoot()}/MEMORY.md`;

    const readTool = createRead(cm as unknown as ContainerManager, 'ws-1');
    const writeTool = createWrite(cm as unknown as ContainerManager, 'ws-1');
    const editTool = createEdit(cm as unknown as ContainerManager, 'ws-1');

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
    const cm = createMockContainerManager();
    const bashTool = createBash(cm as unknown as ContainerManager, 'ws-1');
    const protectedRoot = getProtectedMemoryRoot();

    await expect(bashTool.execute('tool-1', { command: `cat '${protectedRoot}/MEMORY.md'` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));
    await expect(bashTool.execute('tool-2', { command: `cd '${protectedRoot}' && cat *.md` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));

    expect(cm.exec).not.toHaveBeenCalled();
  });
});
