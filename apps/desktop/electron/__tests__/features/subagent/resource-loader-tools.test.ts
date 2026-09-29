/**
 * What a subagent's own loader does with plugin tools: keep out the ones a
 * plugin declares for chat only, whatever an allowlist names, and reach the
 * rest as commands when the session has no allowlist.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from '@earendil-works/pi-coding-agent';

async function writePlugin(root: string, tools: string[], toolSessionKinds: Record<string, string[]>): Promise<string> {
  const packageRoot = path.join(root, 'plugin');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@acme/plugin-tools',
    version: '1.0.0',
    pi: { extensions: ['./index.ts'] },
    sero: { plugin: { toolSessionKinds } },
  }));
  await fs.writeFile(path.join(packageRoot, 'index.ts'), [
    'export default function (pi: any) {',
    ...tools.map((tool) => `  pi.registerTool({ name: '${tool}', label: '${tool}', description: '${tool}', parameters: { type: 'object', properties: {} }, execute: async () => ({ content: [] }) });`),
    "  pi.registerCommand('slash_probe', { description: 'a slash command', handler: async () => undefined });",
    '}',
  ].join('\n'));
  return packageRoot;
}

describe('subagent resource loader tools', () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('@electron/platform/env');
    vi.doUnmock('@electron/features/subagent/runtime/loader');
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  async function loadedTools(bridgePluginTools: boolean): Promise<string[]> {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-subagent-tools-'));
    const cwd = path.join(tempRoot, 'workspace');
    const agentDir = path.join(tempRoot, 'agent');
    await fs.mkdir(cwd, { recursive: true });
    await fs.mkdir(agentDir, { recursive: true });
    const plugin = await writePlugin(tempRoot, ['goal', 'web_lookup'], { goal: ['chat'] });
    await fs.writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ packages: [plugin] }));

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
      sessionId: 'subagent-tools-1',
      settingsManager: SettingsManager.create(cwd, agentDir),
      bridgePluginTools,
    });
    await loader.reload();
    return loader.getExtensions().extensions.flatMap((extension) => [...extension.tools.keys()]);
  }

  it('never loads a chat-only tool, so an allowlist that names it gets nothing', async () => {
    const tools = await loadedTools(false);
    expect(tools).not.toContain('goal');
    expect(tools).toContain('web_lookup');
  });

  it('reaches plugin tools as commands when asked to bridge, and leaves slash commands out', async () => {
    const tools = await loadedTools(true);
    expect(tools).not.toContain('goal');
    expect(tools).not.toContain('web_lookup');
    // A subagent has no chat session behind it, so a slash command listed for it could not run.
    const { getCliRegistry } = await import('@electron/cli');
    const commands = getCliRegistry().list({ workspaceId: 'ws-1', sessionId: 'subagent-tools-1' }).map((command) => command.name);
    expect(commands).toContain('web_lookup');
    expect(commands).not.toContain('slash_probe');
  });
});
