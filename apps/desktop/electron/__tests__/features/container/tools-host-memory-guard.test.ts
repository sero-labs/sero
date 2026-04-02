import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

import { createHostCodingTools } from '../../../features/container/tools';
import {
  getProtectedMemoryAccessError,
  getProtectedMemoryRoot,
} from '../../../features/container/tools/memory-file-guard';

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

  it('blocks direct access to managed memory files when containers are disabled', async () => {
    const tools = createHostCodingTools('/tmp/workspace');
    const protectedPath = `${getProtectedMemoryRoot()}/MEMORY.md`;

    await expect(getTool(tools, 'read').execute('tool-1', { path: protectedPath }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('read'));
    await expect(getTool(tools, 'write').execute('tool-2', { path: protectedPath, content: 'x' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('write'));
    await expect(getTool(tools, 'edit').execute('tool-3', { path: protectedPath, oldText: 'a', newText: 'b' }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('edit'));
    await expect(getTool(tools, 'bash').execute('tool-4', { command: `cat '${protectedPath}'` }, undefined, undefined, undefined as never))
      .rejects.toThrow(getProtectedMemoryAccessError('bash'));
  });
});
