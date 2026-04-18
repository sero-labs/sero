import os from 'os';
import path from 'path';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadExtensionsResult, ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import {
  bridgeExtensionTools,
  getCliRegistry,
  resetCliRegistryForTests,
} from '@electron/cli';
import type { CliCommandContext, CliResult } from '@electron/cli/core/types';

type CustomCliToolDefinition = ToolDefinition & {
  cli: {
    summary?: string;
    help?: string;
    group?: string;
    overrideBuiltin?: boolean;
    execute: (
      args: string[],
      context: CliCommandContext,
    ) => Promise<CliResult>;
  };
};

function makeLoadExtensionsResult(
  extensionPath: string,
  tool: CustomCliToolDefinition,
): LoadExtensionsResult {
  return {
    extensions: [
      {
        path: extensionPath,
        resolvedPath: extensionPath,
        handlers: new Map(),
        tools: new Map([
          [
            tool.name,
            {
              definition: tool,
              extensionPath,
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
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'custom-cli-bridge-'));
  });

  afterEach(async () => {
    resetCliRegistryForTests();
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

    expect(getCliRegistry().get('google')?.source).toBe('builtin');

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
    expect(result).toEqual({ output: 'plugin:auth list --check', exitCode: 0, content: undefined, details: undefined });
  });
});
