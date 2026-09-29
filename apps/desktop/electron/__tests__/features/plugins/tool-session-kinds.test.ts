import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSyntheticSourceInfo,
  defineTool,
  type LoadExtensionsResult,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  clearPluginBridgePolicyCache,
  dropToolsNotForSessionKind,
  type ToolSessionKind,
} from '@electron/features/plugins/bridge-policy';

const ORCHESTRATOR_MANIFEST = path.resolve(
  __dirname,
  '../../../../../../plugins/sero-orchestrator-plugin/package.json',
);

function extensionWith(extensionPath: string, toolNames: string[]): LoadExtensionsResult {
  const sourceInfo = createSyntheticSourceInfo(extensionPath, { source: 'extension' });
  return {
    extensions: [{
      path: extensionPath,
      resolvedPath: extensionPath,
      sourceInfo,
      handlers: new Map(),
      tools: new Map(toolNames.map((name) => [name, {
        definition: defineTool({
          name,
          label: name,
          description: name,
          parameters: Type.Object({}),
          execute: async () => ({ content: [{ type: 'text', text: name }], details: null }),
        }),
        sourceInfo,
      }])),
      messageRenderers: new Map(),
      commands: new Map(toolNames.map((name) => [name, { name, sourceInfo, handler: async () => {} }])),
      flags: new Map(),
      shortcuts: new Map(),
    }],
    errors: [],
    runtime: {} as LoadExtensionsResult['runtime'],
  };
}

function toolsFor(extensionPath: string, toolNames: string[], kind: ToolSessionKind): string[] {
  const base = dropToolsNotForSessionKind(extensionWith(extensionPath, toolNames), kind);
  return [...base.extensions[0]!.tools.keys()];
}

describe('tool session kinds', () => {
  let tmpDir = '';

  beforeEach(async () => {
    clearPluginBridgePolicyCache();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'tool-session-kinds-'));
  });

  afterEach(async () => {
    clearPluginBridgePolicyCache();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writePlugin(toolSessionKinds: Record<string, string[]>): Promise<string> {
    const extensionPath = path.join(tmpDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'fixture', sero: { plugin: { toolSessionKinds } } }),
      'utf8',
    );
    return extensionPath;
  }

  it('gives chat-only, member-only and undeclared tools to the right kinds', async () => {
    const extensionPath = await writePlugin({ chatOnly: ['chat'], memberOnly: ['member'] });
    const names = ['chatOnly', 'memberOnly', 'anywhere'];

    expect(toolsFor(extensionPath, names, 'chat')).toEqual(['chatOnly', 'anywhere']);
    expect(toolsFor(extensionPath, names, 'subagent')).toEqual(['anywhere']);
    expect(toolsFor(extensionPath, names, 'member')).toEqual(['memberOnly', 'anywhere']);
  });

  it('drops a slash command that shares the name of a dropped tool', async () => {
    const extensionPath = await writePlugin({ chatOnly: ['chat'] });
    const base = dropToolsNotForSessionKind(extensionWith(extensionPath, ['chatOnly']), 'member');

    expect([...base.extensions[0]!.commands.keys()]).toEqual([]);
  });

  it('keeps goals and Rooms control out of subagents, and gives members only room', async () => {
    const manifest = JSON.parse(await readFile(ORCHESTRATOR_MANIFEST, 'utf8')) as {
      sero: { plugin: { toolSessionKinds: Record<string, string[]> } };
    };
    const extensionPath = await writePlugin(manifest.sero.plugin.toolSessionKinds);
    const names = ['orchestrator', 'goal', 'goals', 'goal_complete', 'goal_blocked', 'goal_wait', 'rooms', 'room'];

    expect(toolsFor(extensionPath, names, 'subagent')).toEqual(['orchestrator']);
    expect(toolsFor(extensionPath, names, 'member')).toEqual(['room']);
    expect(toolsFor(extensionPath, names, 'chat')).toEqual(names.filter((name) => name !== 'room'));
  });
});
