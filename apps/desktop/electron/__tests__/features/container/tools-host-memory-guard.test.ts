import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import { createHostCodingTools } from '@electron/features/container/tools/tools-host';
import {
  getProtectedMemoryAccessError,
  getProtectedMemoryRoot,
} from '@electron/features/container/tools/memory-file-guard';

function getTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

describe('host coding tools memory guard', () => {
  const originalSeroHome = process.env.SERO_HOME;

  beforeEach(() => {
    process.env.SERO_HOME = '/tmp/sero-home';
  });

  afterEach(() => {
    process.env.SERO_HOME = originalSeroHome;
  });

  it('blocks direct and cwd-based access to managed memory files when containers are disabled', async () => {
    const tools = createHostCodingTools('/tmp/workspace');
    const protectedRoot = getProtectedMemoryRoot();
    const protectedPath = `${protectedRoot}/MEMORY.md`;

    await expect(getTool(tools, 'read').execute('tool-1', { path: protectedPath }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('read'));
    await expect(getTool(tools, 'write').execute('tool-2', { path: protectedPath, content: 'x' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('write'));
    await expect(getTool(tools, 'edit').execute('tool-3', { path: protectedPath, oldText: 'a', newText: 'b' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('edit'));
    await expect(getTool(tools, 'bash').execute('tool-4', { command: `cat '${protectedPath}'` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));
    await expect(getTool(tools, 'bash').execute('tool-5', { command: `cd '${protectedRoot}' && cat *.md` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));
  });

  it('blocks symlinked access to managed memory files when containers are disabled', async () => {
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'sero-host-guard-'));
    const protectedRoot = getProtectedMemoryRoot();
    const protectedPath = path.join(protectedRoot, 'MEMORY.md');

    await mkdir(protectedRoot, { recursive: true });
    await writeFile(protectedPath, '# Memory\n', 'utf8');
    await symlink(protectedPath, path.join(workspaceDir, 'memory-link'));

    const tools = createHostCodingTools(workspaceDir);

    try {
      await expect(getTool(tools, 'read').execute('tool-1', { path: 'memory-link' }, undefined, undefined, undefined as never))
        .rejects.toThrow(getProtectedMemoryAccessError('read'));
      await expect(getTool(tools, 'write').execute('tool-2', { path: 'memory-link', content: 'x' }, undefined, undefined, undefined as never))
        .rejects.toThrow(getProtectedMemoryAccessError('write'));
      await expect(getTool(tools, 'edit').execute('tool-3', { path: 'memory-link', oldText: '# Memory', newText: '# Other' }, undefined, undefined, undefined as never))
        .rejects.toThrow(getProtectedMemoryAccessError('edit'));
      await expect(getTool(tools, 'bash').execute('tool-4', { command: 'cat memory-link' }, undefined, undefined, undefined as never))
        .rejects.toThrow(getProtectedMemoryAccessError('bash'));
    } finally {
      await rm(workspaceDir, { recursive: true, force: true });
      await rm(protectedRoot, { recursive: true, force: true });
    }
  });
});
