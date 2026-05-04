import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyntheticSourceInfo, defineTool, type AgentSession, type LoadExtensionsResult, type ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';

import {
  bridgeExtensionTools,
  clearBridgedExtensionSessionStateForSession,
  getCliRegistry,
  resetCliRegistryForTests,
} from '@electron/cli';
import { createSeroCliTool } from '@electron/cli/core/tool';
import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { workspaceManager } from '@electron/shared/infra/shared-infra';

type CustomCliToolDefinition = ToolDefinition & {
  cli: NonNullable<ToolDefinition['cli']>;
};

function installSessionBridge(sessionIds: string[]) {
  installCliSessionBridge({
    getSessionEntry: (sessionId) => {
      if (!sessionIds.includes(sessionId)) return undefined;
      return {
        sessionId,
        workspaceId: 'ws-1',
        session: {} as AgentSession,
        lastSessionName: undefined,
      };
    },
    getActiveSessionForWorkspace: () => undefined,
    getActiveTurnId: () => null,
    noteTurnStart: () => {},
    noteTurnEnd: () => {},
    consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
    setSessionTitle: () => {},
  });
}

function makeLoadExtensionsResult(
  extensionPath: string,
  tool: CustomCliToolDefinition,
): LoadExtensionsResult {
  return {
    extensions: [
      {
        path: extensionPath,
        resolvedPath: extensionPath,
        sourceInfo: createSyntheticSourceInfo(extensionPath, { source: 'extension' }),
        handlers: new Map(),
        tools: new Map([
          [
            tool.name,
            {
              definition: tool,
              sourceInfo: createSyntheticSourceInfo(extensionPath, { source: 'extension' }),
            },
          ],
        ]),
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

describe('custom tool CLI bridge metadata', () => {
  let tmpDir = '';

  beforeEach(async () => {
    resetCliRegistryForTests();
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'custom-cli-bridge-'));
  });

  afterEach(async () => {
    resetCliRegistryForTests();
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('lets a plugin tool override a builtin command with custom help and raw-args execution', async () => {
    const pluginDir = path.join(tmpDir, 'plugin-google');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-google',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'integrations',
            tags: ['google'],
            bridgeTools: ['google'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const customExecute = vi.fn(async (args: string[]) => ({
      output: `plugin:${args.join(' ')}`,
      exitCode: 0,
    }));

    const tool: CustomCliToolDefinition = {
      name: 'google',
      label: 'Google',
      description: 'Plugin-owned Google bridge.',
      parameters: Type.Object({
        service: Type.String(),
      }),
      execute: async () => ({
        content: [{ type: 'text', text: 'tool execute' }],
        details: null,
      }),
      cli: {
        summary: 'Plugin Google summary',
        help: 'plugin google help',
        group: 'Google',
        overrideBuiltin: true,
        execute: customExecute,
      },
    };

    getCliRegistry().register({
      name: 'google',
      summary: 'Legacy builtin Google command',
      help: 'legacy google help',
      source: 'builtin',
      group: 'Google',
      execute: async () => ({ output: 'builtin google', exitCode: 0 }),
    });

    bridgeExtensionTools(makeLoadExtensionsResult(extensionPath, tool));

    const command = getCliRegistry().get('google');
    expect(command?.source).toBe('app');
    expect(command?.summary).toBe('Plugin Google summary');
    expect(command?.help).toBe('plugin google help');
    expect(command?.group).toBe('Google');

    const result = await command!.execute(
      ['auth', 'list', '--check'],
      {
        workspaceId: 'ws-1',
        cwd: '/tmp/ws-1',
        invocation: {
          workspaceId: 'ws-1',
          sessionId: null,
          turnId: null,
          source: 'tool',
        },
        workspaceManager: {} as never,
        containerManager: {} as never,
      },
    );

    expect(customExecute).toHaveBeenCalledWith(
      ['auth', 'list', '--check'],
      expect.objectContaining({ workspaceId: 'ws-1', cwd: '/tmp/ws-1' }),
      undefined,
    );
    expect(result).toEqual({
      output: 'plugin:auth list --check',
      exitCode: 0,
      content: undefined,
      details: undefined,
    });
  });

  it('refreshes custom command help and execution when a session reloads the same plugin', async () => {
    installSessionBridge(['session-1']);

    const pluginDir = path.join(tmpDir, 'plugin-google-live');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-google-live',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'integrations',
            tags: ['google'],
            bridgeTools: ['google'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const executeV1 = vi.fn(async () => ({ output: 'v1', exitCode: 0 }));
    const executeV2 = vi.fn(async () => ({ output: 'v2', exitCode: 0 }));

    const baseTool = defineTool({
      name: 'google',
      label: 'Google',
      description: 'Plugin-owned Google bridge.',
      parameters: Type.Object({
        service: Type.String(),
      }),
      execute: async () => ({
        content: [{ type: 'text', text: 'tool execute' }],
        details: null,
      }),
    });

    const toolV1: CustomCliToolDefinition = {
      ...baseTool,
      cli: {
        summary: 'Google summary v1',
        help: 'google help v1',
        group: 'Google',
        overrideBuiltin: true,
        execute: executeV1,
      },
    };

    const toolV2: CustomCliToolDefinition = {
      ...baseTool,
      cli: {
        summary: 'Google summary v2',
        help: 'google help v2',
        group: 'Google',
        overrideBuiltin: true,
        execute: executeV2,
      },
    };

    bridgeExtensionTools(makeLoadExtensionsResult(extensionPath, toolV1), { sessionId: 'session-1' });
    expect(getCliRegistry().get('google')?.summary).toBe('Google summary v1');
    expect(getCliRegistry().get('google')?.help).toBe('google help v1');

    bridgeExtensionTools(makeLoadExtensionsResult(extensionPath, toolV2), { sessionId: 'session-1' });
    expect(getCliRegistry().get('google')?.summary).toBe('Google summary v2');
    expect(getCliRegistry().get('google')?.help).toBe('google help v2');

    const tool = createSeroCliTool(getCliRegistry(), 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'google auth list' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(executeV1).not.toHaveBeenCalled();
    expect(executeV2).toHaveBeenCalledWith(
      ['auth', 'list'],
      expect.objectContaining({ workspaceId: 'ws-1', cwd: '/tmp/ws-1' }),
      undefined,
    );
    expect(result.content).toEqual([{ type: 'text', text: 'v2' }]);
  });

  it('removes session-owned app commands when bridged session state is cleared', async () => {
    installSessionBridge(['session-1']);

    const pluginDir = path.join(tmpDir, 'plugin-cleanup');
    const extensionPath = path.join(pluginDir, 'extension', 'index.js');
    await mkdir(path.dirname(extensionPath), { recursive: true });
    await writeFile(extensionPath, 'export default {}\n', 'utf8');
    await writeFile(
      path.join(pluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin-cleanup',
        version: '1.0.0',
        sero: {
          plugin: {
            category: 'utilities',
            tags: ['cleanup'],
            bridgeTools: ['plugin_cleanup'],
          },
        },
      }, null, 2),
      'utf8',
    );

    const tool: CustomCliToolDefinition = {
      name: 'plugin_cleanup',
      label: 'Plugin Cleanup',
      description: 'Cleanup command.',
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: 'text', text: 'cleanup' }],
        details: null,
      }),
      cli: {
        summary: 'Cleanup summary',
        execute: async () => ({ output: 'cleanup', exitCode: 0 }),
      },
    };

    bridgeExtensionTools(makeLoadExtensionsResult(extensionPath, tool), { sessionId: 'session-1' });
    expect(getCliRegistry().get('plugin_cleanup')).toBeTruthy();

    clearBridgedExtensionSessionStateForSession('session-1');
    expect(getCliRegistry().get('plugin_cleanup')).toBeUndefined();
  });
});
