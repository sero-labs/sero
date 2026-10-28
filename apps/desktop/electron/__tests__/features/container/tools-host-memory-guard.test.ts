import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

import { createHostRuntime } from '../../helpers/host-runtime';
import { createBash, createEdit, createRead, createWrite } from '@electron/features/container/tools/tools-coding';
import {
  getProtectedMemoryAccessError,
  getProtectedMemoryRoot,
} from '@electron/features/container/tools/memory-file-guard';

/**
 * The tools a host workspace actually runs, on the real host runtime (#658).
 * `tools-host.ts` had its own copy of these; the guard belongs to the tools the
 * session loads, so it is tested there.
 *
 * `rootDir` is passed as the tools' cwd, which is the worktree-subdirectory case
 * a session uses. A session at the default `/workspace` cwd reaches a symlink
 * through `bash` without the guard seeing it: that is #678, not something this
 * test should claim to cover.
 */
function hostTools(rootDir: string): ToolDefinition[] {
  const runtime = createHostRuntime(rootDir);
  return [
    createBash(runtime, rootDir),
    createRead(runtime, rootDir),
    createWrite(runtime, rootDir),
    createEdit(runtime, rootDir),
  ];
}

function getTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

describe('memory guard on the host runtime', () => {
  const originalSeroHome = process.env.SERO_HOME;
  let seroHome: string;

  // A real Sero home: the production backend resolves its allowed roots from
  // SERO_HOME, so a path that does not exist cannot stand in for one.
  beforeEach(async () => {
    seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-home-guard-'));
    // The agent directory is one of the backend's allowed roots, so a real
    // install always has it; the guard test needs the same shape.
    await mkdir(path.join(seroHome, 'agent'), { recursive: true });
    process.env.SERO_HOME = seroHome;
  });

  afterEach(async () => {
    process.env.SERO_HOME = originalSeroHome;
    await rm(seroHome, { recursive: true, force: true });
  });

  it('blocks direct and cwd-based access to managed memory files when containers are disabled', async () => {
    const tools = hostTools('/tmp/workspace');
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

    const tools = hostTools(workspaceDir);

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
