import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliCommandContext } from '@electron/cli/core';

describe('Agent Plugin manager lifecycle', () => {
  let tempRoot: string | null = null;

  async function importManager() {
    if (!tempRoot) throw new Error('tempRoot is not initialized.');
    vi.resetModules();
    const agentDir = path.join(tempRoot, 'agent');
    vi.doMock('@electron/platform/env', () => ({
      SERO_HOME: tempRoot,
      SERO_AGENT_DIR: agentDir,
      SERO_FIXED_ROOT: tempRoot,
      SERO_HOST_ARTIFACTS_ROOT: tempRoot,
    }));
    return {
      ...await import('@electron/features/agent-plugins/manager'),
      ...await import('@electron/features/agent-plugins/registry'),
      ...await import('@electron/features/agent-plugins/skills'),
      ...await import('@electron/features/agent-plugins/cli'),
      ...await import('@electron/cli/core'),
      agentDir,
    };
  }

  async function createExecutablePlugin(): Promise<string> {
    const source = path.join(tempRoot!, 'source');
    await fs.mkdir(path.join(source, 'bin'), { recursive: true });
    await fs.writeFile(path.join(source, 'plugin.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'release-tools',
      version: '1.0.0',
    }));
    await fs.writeFile(path.join(source, 'bin', 'server'), '#!/bin/sh\n');
    await fs.writeFile(path.join(source, 'mcp.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { release: { type: 'stdio', command: './bin/server' } },
    }));
    return source;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('@electron/platform/env');
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it('installs the official skill fixture, reloads it, disables it, and removes only owned content', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-manager-'));
    const fixture = path.resolve(process.cwd(), 'electron/__tests__/fixtures/agent-plugins/official-example');
    const manager = await importManager();
    const inspection = await manager.inspectAgentPluginSource(fixture);
    const plugin = await manager.installAgentPlugin({
      source: fixture,
      contentDigest: inspection.contentDigest,
      approveMcpDefinitions: false,
      exposeToCli: true,
    });

    expect(plugin.packagePath).toBe(path.join(manager.agentDir, 'agent-plugins', plugin.id));
    expect(plugin.dataPath).toBe(path.join(manager.agentDir, 'agent-plugin-data', plugin.id));
    expect(plugin.cli.skillCommands).toEqual(['agent-plugins-example/migrate-agent-plugin']);
    expect(manager.withAgentPluginSkills({ skills: [], diagnostics: [] }).skills.map((skill) => skill.name))
      .toEqual(['migrate-agent-plugin']);

    const skillCommand = manager.buildAgentPluginCliCommands(new manager.CliRegistry())[0]!;
    await fs.rm(plugin.skills[0]!.filePath);
    await expect(skillCommand.execute([], {
      workspaceId: 'workspace',
      invocation: { workspaceId: 'workspace', sessionId: 'session', turnId: null, source: 'tool' },
    } as CliCommandContext)).resolves.toMatchObject({ exitCode: 1 });

    await manager.setAgentPluginEnabled(plugin.id, false);
    expect(manager.withAgentPluginSkills({ skills: [], diagnostics: [] }).skills).toEqual([]);
    await manager.removeAgentPlugin({ id: plugin.id, retainData: true });
    await expect(fs.stat(plugin.packagePath)).rejects.toThrow();
    await expect(fs.stat(plugin.dataPath)).resolves.toBeDefined();
    expect(await manager.listInstalledAgentPlugins()).toEqual([]);
  });

  it('retains PLUGIN_DATA and requires renewed approval when executable configuration changes', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-manager-'));
    const source = await createExecutablePlugin();
    const manager = await importManager();
    const inspection = await manager.inspectAgentPluginSource(source);
    const plugin = await manager.installAgentPlugin({
      source,
      contentDigest: inspection.contentDigest,
      approveMcpDefinitions: true,
      exposeToCli: false,
    });
    const marker = path.join(plugin.dataPath, 'state.txt');
    await fs.writeFile(marker, 'retained');
    const mcpPath = path.join(source, 'mcp.json');
    const next = JSON.parse(await fs.readFile(mcpPath, 'utf8')) as { mcpServers: { release: Record<string, unknown> } };
    next.mcpServers.release.args = ['--changed'];
    await fs.writeFile(mcpPath, JSON.stringify(next));

    const preview = await manager.previewAgentPluginUpdate(plugin.id);
    expect(preview.requiresMcpApproval).toBe(true);
    expect(preview.mcpServers[0]).toMatchObject({
      name: 'release',
      args: ['--changed'],
      env: expect.objectContaining({ PLUGIN_ROOT: expect.any(String), PLUGIN_DATA: expect.any(String) }),
    });
    expect(preview.mcpServers[0]?.command).toMatch(/\/bin\/server$/);
    await expect(manager.updateAgentPlugin({ id: plugin.id, contentDigest: preview.contentDigest, approveMcpChanges: false }))
      .rejects.toThrow('needs approval');
    const updated = await manager.updateAgentPlugin({ id: plugin.id, contentDigest: preview.contentDigest, approveMcpChanges: true });
    expect(updated.mcpServers[0]).toMatchObject({ approved: true, args: ['--changed'] });
    await expect(fs.readFile(marker, 'utf8')).resolves.toBe('retained');

    await manager.removeAgentPlugin({ id: plugin.id, retainData: false });
    await expect(fs.stat(plugin.dataPath)).rejects.toThrow();
  });

  it('rejects install content that differs from the inspected source', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-manager-'));
    const source = await createExecutablePlugin();
    const manager = await importManager();
    const inspection = await manager.inspectAgentPluginSource(source);
    await fs.writeFile(path.join(source, 'changed.txt'), 'changed after review');

    await expect(manager.installAgentPlugin({
      source,
      contentDigest: inspection.contentDigest,
      approveMcpDefinitions: true,
      exposeToCli: false,
    })).rejects.toThrow('changed after inspection');
  });

  it('returns an empty registry when its JSON is corrupt', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-manager-'));
    const manager = await importManager();
    await fs.mkdir(manager.agentDir, { recursive: true });
    await fs.writeFile(path.join(manager.agentDir, 'agent-plugins.json'), '{broken');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(manager.readAgentPluginRegistrySync().plugins).toEqual([]);
    await expect(manager.readAgentPluginRegistry()).resolves.toEqual({ version: 1, plugins: [] });
  });

  it('registers exact cached MCP tool paths and delegates to the managed runtime', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-manager-'));
    const source = await createExecutablePlugin();
    const manager = await importManager();
    const inspection = await manager.inspectAgentPluginSource(source);
    const plugin = await manager.installAgentPlugin({
      source,
      contentDigest: inspection.contentDigest,
      approveMcpDefinitions: true,
      exposeToCli: true,
    });
    const cachePath = path.join(tempRoot, 'apps', 'mcp', 'metadata-cache.json');
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify({
      version: 1,
      servers: {
        [plugin.mcpServers[0]!.runtimeName]: {
          tools: [{
            name: 'publish',
            description: 'Publish a release',
            inputSchema: {
              type: 'object',
              properties: { environment: { type: 'string' } },
              required: ['environment'],
            },
          }],
        },
      },
    }));
    const executeMcp = vi.fn(async () => ({ output: 'published' }));
    const registry = new manager.CliRegistry();
    registry.register({ name: 'mcp', summary: 'MCP', execute: executeMcp });
    const commands = manager.buildAgentPluginCliCommands(registry);
    expect(commands.map((command) => command.name)).toEqual(['release-tools/release/publish']);

    await commands[0]!.execute(['staging'], {
      workspaceId: 'workspace',
      invocation: { workspaceId: 'workspace', sessionId: 'session', turnId: null, source: 'tool' },
    } as CliCommandContext);
    expect(executeMcp).toHaveBeenCalledWith(
      ['call', plugin.mcpServers[0]!.runtimeName, 'publish', '{"environment":"staging"}'],
      expect.any(Object),
      undefined,
    );
  });

  it('allows reserved manifest names when CLI exposure is off', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-agent-plugin-manager-'));
    const source = path.join(tempRoot, 'reserved-source');
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, 'plugin.json'), JSON.stringify({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'mcp',
    }));
    const manager = await importManager();
    const inspection = await manager.inspectAgentPluginSource(source);
    const plugin = await manager.installAgentPlugin({
      source,
      contentDigest: inspection.contentDigest,
      approveMcpDefinitions: false,
      exposeToCli: false,
    });
    expect(plugin.cli.enabled).toBe(false);
    await expect(manager.setAgentPluginCliExposure({ id: plugin.id, enabled: true }))
      .rejects.toThrow('namespace is reserved');
  });
});
