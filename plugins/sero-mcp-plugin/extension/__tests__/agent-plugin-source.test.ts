import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { EventBus } from '@earendil-works/pi-coding-agent';
import type { AgentPluginMcpSource, AgentPluginMcpSourcesRequest } from '@sero-ai/common';
import { setAgentPluginServerEnabled } from '../config/agent-plugin-client-state';
import {
  configureAgentPluginMcpSource,
  withAgentPluginMcpSources,
} from '../config/agent-plugin-source';
import { createDefaultMcpConfig } from '../config/types';

const originalSeroHome = process.env.SERO_HOME;
let tempRoot: string | null = null;

afterEach(async () => {
  configureAgentPluginMcpSource(null);
  if (originalSeroHome === undefined) delete process.env.SERO_HOME;
  else process.env.SERO_HOME = originalSeroHome;
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe('Agent Plugin MCP source adapter', () => {
  function provide(sources: AgentPluginMcpSource[]): void {
    configureAgentPluginMcpSource({
      emit(_channel: string, data: unknown) {
        const request = data as AgentPluginMcpSourcesRequest;
        request.accept();
        request.resolve(sources);
      },
    } as EventBus);
  }

  it('merges approved managed servers without changing user config', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-mcp-agent-plugin-'));
    process.env.SERO_HOME = tempRoot;
    provide([{
      pluginId: 'ap-test',
      pluginName: 'portable-tools',
      server: {
        name: 'deploy',
        runtimeName: 'agent-plugin:ap-test:deploy',
        transport: 'streamable-http',
        valid: true,
        approved: true,
        exposedToCli: false,
        url: 'https://example.com/mcp',
      },
    }, {
      pluginId: 'ap-test',
      pluginName: 'portable-tools',
      server: {
        name: 'events',
        runtimeName: 'agent-plugin:ap-test:events',
        transport: 'sse',
        valid: true,
        approved: true,
        exposedToCli: false,
        url: 'https://example.com/events',
      },
    }]);
    const userConfig = createDefaultMcpConfig();
    userConfig.mcpServers.user = { transport: 'stdio', command: 'user-server' };

    const effective = await withAgentPluginMcpSources(userConfig);

    expect(Object.keys(userConfig.mcpServers)).toEqual(['user']);
    expect(effective.mcpServers['agent-plugin:ap-test:deploy']).toMatchObject({
      transport: 'http',
      portableTransport: 'streamable-http',
      managedByAgentPlugin: { pluginId: 'ap-test', pluginName: 'portable-tools', serverName: 'deploy' },
    });
    expect(effective.mcpServers['agent-plugin:ap-test:events']).toMatchObject({
      transport: 'http',
      portableTransport: 'sse',
    });

    await setAgentPluginServerEnabled('agent-plugin:ap-test:deploy', false);
    const disabled = await withAgentPluginMcpSources(userConfig);
    expect(disabled.mcpServers['agent-plugin:ap-test:deploy']?.enabled).toBe(false);
    expect(Object.keys(userConfig.mcpServers)).toEqual(['user']);
  });

  it('rejects an unapproved executable even if a host sends it', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-mcp-agent-plugin-'));
    process.env.SERO_HOME = tempRoot;
    provide([{
      pluginId: 'ap-test',
      pluginName: 'portable-tools',
      server: {
        name: 'local', runtimeName: 'agent-plugin:ap-test:local', transport: 'stdio',
        valid: true, approved: false, exposedToCli: false, command: '/fixture/server',
      },
    }]);

    const effective = await withAgentPluginMcpSources(createDefaultMcpConfig());
    expect(effective.mcpServers).toEqual({});
  });
});
