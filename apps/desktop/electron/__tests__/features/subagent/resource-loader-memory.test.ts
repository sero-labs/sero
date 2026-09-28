/**
 * Memory belongs to the user's chat: a subagent must load neither the memory
 * plugin's tools nor its prompt hooks, whatever its tool policy. The plugin is
 * identified by its package name, not by where it is installed.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from '@earendil-works/pi-coding-agent';

async function writeExtensionPackage(root: string, dir: string, name: string, tools: string[]): Promise<string> {
  const packageRoot = path.join(root, dir);
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    pi: { extensions: ['./index.ts'] },
  }));
  await fs.writeFile(path.join(packageRoot, 'index.ts'), [
    'export default function (pi: any) {',
    ...tools.map((tool) => `  pi.registerTool({ name: '${tool}', label: '${tool}', description: '${tool}', parameters: { type: 'object', properties: {} }, execute: async () => ({ content: [] }) });`),
    "  pi.on('before_agent_start', (event: any) => ({ systemPrompt: event.systemPrompt + ' MEMORY-SNAPSHOT' }));",
    '}',
  ].join('\n'));
  return packageRoot;
}

describe('subagent resource loader', () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('@electron/platform/env');
    vi.doUnmock('@electron/features/subagent/runtime/loader');
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it('leaves out the memory plugin, wherever it is installed, and keeps other plugins', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-subagent-memory-'));
    const cwd = path.join(tempRoot, 'workspace');
    const agentDir = path.join(tempRoot, 'agent');
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(agentDir, { recursive: true });
    const memory = await writeExtensionPackage(tempRoot, 'renamed-folder', '@sero-ai/plugin-memory', ['memory', 'scratchpad']);
    const other = await writeExtensionPackage(tempRoot, 'other', '@acme/plugin-other', ['other_tool']);
    await fs.writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ packages: [memory, other] }));

    vi.doMock('@electron/platform/env', async (importOriginal) => ({
      ...await importOriginal<typeof import('@electron/platform/env')>(),
      SERO_AGENT_DIR: agentDir,
    }));
    vi.doMock('@electron/features/subagent/runtime/loader', () => ({
      createSubagentExtensionFactory: () => () => undefined,
    }));
    const { createSubagentResourceLoader } = await import('@electron/features/subagent/runtime/resource-loader');

    const loader = createSubagentResourceLoader({
      cwd,
      workspaceManager: {} as never,
      workspaceId: 'ws-1',
      sessionId: 'subagent-1',
      settingsManager: SettingsManager.create(cwd, agentDir),
      restrictSearchTools: false,
    });
    await loader.reload();

    const extensions = loader.getExtensions().extensions;
    const tools = extensions.flatMap((extension) => [...extension.tools.keys()]);
    expect(tools).toContain('other_tool');
    expect(tools).not.toContain('memory');
    expect(tools).not.toContain('scratchpad');
    // The memory prompt hook rides on the extension, so only the other plugin keeps one.
    expect(extensions.filter((extension) => extension.handlers.has('before_agent_start'))).toHaveLength(1);
  });
});
