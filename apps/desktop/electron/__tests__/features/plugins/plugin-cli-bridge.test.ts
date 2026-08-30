import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createSyntheticSourceInfo, defineTool, type LoadExtensionsResult } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  bridgeExtensionTools,
  clearPluginBridgePolicyCache,
  getCliRegistry,
  resetCliRegistryForTests,
} from '@electron/cli';

function createLoadExtensionsResult(
  extensionPath: string,
  toolNames: string[],
): LoadExtensionsResult {
  return {
    extensions: [
      {
        path: extensionPath,
        resolvedPath: extensionPath,
        sourceInfo: createSyntheticSourceInfo(extensionPath, { source: 'extension' }),
        handlers: new Map(),
        tools: new Map(toolNames.map((name) => [
          name,
          {
            definition: defineTool({
              name,
              label: name,
              description: `${name} description`,
              parameters: Type.Object({}),
              execute: async () => ({
                content: [{ type: 'text', text: `${name} result` }],
                details: null,
              }),
            }),
            sourceInfo: createSyntheticSourceInfo(extensionPath, { source: 'extension' }),
          },
        ])),
        messageRenderers: new Map(),
        commands: new Map(),
        flags: new Map(),
        shortcuts: new Map(),
      },
    ],
    errors: [],
    runtime: {} as LoadExtensionsResult['runtime'],
  };
}

describe('plugin CLI bridging', () => {
  let tmpDir = '';

  beforeEach(async () => {
    resetCliRegistryForTests();
    clearPluginBridgePolicyCache();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'plugin-cli-bridge-'));
  });

  afterEach(async () => {
    resetCliRegistryForTests();
    clearPluginBridgePolicyCache();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('bridges all plugin tools by default when sero.plugin.bridgeTools is omitted', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-all');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-all',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: [],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['plugin_all_default']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('plugin_all_default')).toBe(false);
    expect(getCliRegistry().get('plugin_all_default')).toBeTruthy();
  });

  it('bridges kanban when the plugin manifest explicitly owns the CLI bridge', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-kanban');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-kanban',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'productivity',
            tags: [],
            bridgeTools: ['kanban'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['kanban']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('kanban')).toBe(false);
    expect(getCliRegistry().get('kanban')).toBeTruthy();
  });

  it('does not bridge plugin tools when sero.plugin.bridgeTools is false', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-none');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-none',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: [],
            bridgeTools: false,
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['plugin_none_default']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('plugin_none_default')).toBe(true);
    expect(getCliRegistry().get('plugin_none_default')).toBeFalsy();
  });

  it('bridges only explicitly listed tool names when bridgeTools is an array', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-selective');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-selective',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: [],
            bridgeTools: ['plugin_selective_keep'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, [
      'plugin_selective_keep',
      'plugin_selective_skip',
    ]);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('plugin_selective_keep')).toBe(false);
    expect(base.extensions[0]?.tools.has('plugin_selective_skip')).toBe(true);
    expect(getCliRegistry().get('plugin_selective_keep')).toBeTruthy();
    expect(getCliRegistry().get('plugin_selective_skip')).toBeFalsy();
  });

  it('keeps Orchestrator Goal terminal tools directly callable', () => {
    const extensionPath = path.resolve(
      process.cwd(),
      '../../plugins/sero-orchestrator-plugin/extension/index.ts',
    );
    const base = createLoadExtensionsResult(extensionPath, [
      'orchestrator',
      'goal',
      'room',
      'rooms',
      'goal_complete',
      'goal_blocked',
      'goal_wait',
    ]);

    bridgeExtensionTools(base);

    expect([...base.extensions[0]!.tools.keys()]).toEqual([
      'goal_complete',
      'goal_blocked',
      'goal_wait',
    ]);
    expect(getCliRegistry().get('goal')).toBeTruthy();
    expect(getCliRegistry().get('goal_complete')).toBeFalsy();
  });

  it('keeps mcp_manager private when the MCP plugin bridges only mcp', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-mcp');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@sero-ai/plugin-mcp',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'developer-tools',
            tags: ['mcp'],
            bridgeTools: ['mcp'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const base = createLoadExtensionsResult(extensionPath, ['mcp', 'mcp_manager']);
    bridgeExtensionTools(base);

    expect(base.extensions[0]?.tools.has('mcp')).toBe(false);
    expect(base.extensions[0]?.tools.has('mcp_manager')).toBe(true);
    expect(getCliRegistry().get('mcp')).toBeTruthy();
    expect(getCliRegistry().get('mcp_manager')).toBeFalsy();
  });

  it('keeps a session tool as fallback for a transient Agent Plugin command', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-fallback');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-fallback',
        version: '1.0.0',
        sero: { plugin: { category: 'utilities', tags: [], bridgeTools: ['shared_tool'] } },
      }),
      'utf8',
    );

    const registry = getCliRegistry();
    registry.replaceAgentPluginCommands([{
      name: 'shared_tool',
      summary: 'Transient command',
      source: 'agent-plugin',
      execute: async () => ({ output: 'transient' }),
    }]);
    const base = createLoadExtensionsResult(extensionPath, ['shared_tool']);
    bridgeExtensionTools(base, { sessionId: 'session-1' });
    registry.replaceAgentPluginCommands([]);

    expect(registry.get('shared_tool', { sessionId: 'session-1' })?.source).toBe('app');
  });
});
