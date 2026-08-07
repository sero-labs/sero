import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventBus } from '@earendil-works/pi-coding-agent';
import type { AgentPluginMcpSourcesRequest } from '@sero-ai/common';
import { configureAgentPluginMcpSource } from '../config/agent-plugin-source';
import { getMcpRuntime } from '../runtime/mcp-runtime';
import { getMcpConfigPath } from '../state/paths';

const originalSeroHome = process.env.SERO_HOME;
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-mcp-managed-guard-'));
  process.env.SERO_HOME = tempRoot;
  configureAgentPluginMcpSource({
    emit(_channel: string, data: unknown) {
      const request = data as AgentPluginMcpSourcesRequest;
      request.accept();
      request.resolve([{
        pluginId: 'ap-fixture',
        pluginName: 'fixture',
        server: {
          name: 'owned',
          runtimeName: 'agent-plugin:ap-fixture:owned',
          transport: 'streamable-http',
          valid: true,
          approved: true,
          exposedToCli: false,
          url: 'https://example.com/mcp',
        },
      }]);
    },
  } as unknown as EventBus);
});

afterEach(async () => {
  configureAgentPluginMcpSource(null);
  if (originalSeroHome === undefined) delete process.env.SERO_HOME;
  else process.env.SERO_HOME = originalSeroHome;
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('managed MCP mutation guards', () => {
  it('blocks agent-facing remove and upsert actions for managed servers', async () => {
    const runtime = getMcpRuntime();
    const serverName = 'agent-plugin:ap-fixture:owned';

    const removeResult = await runtime.executeManagerAction('remove_server', {
      cwd: tempRoot,
      serverName,
    });
    expect(removeResult.content[0]?.text).toContain('managed by Agent Plugin fixture');

    const upsertResult = await runtime.executeManagerAction('upsert_server', {
      cwd: tempRoot,
      serverInput: {
        originalServerName: serverName,
        serverName,
        enabled: true,
        transport: 'http',
        lifecycle: 'lazy',
        authMode: 'none',
        command: '',
        argsText: '',
        cwd: '',
        url: 'https://changed.example/mcp',
        bearerTokenEnv: '',
        exposeResources: false,
        debug: false,
      },
    });
    expect(upsertResult.content[0]?.text).toContain('managed by Agent Plugin fixture');

    const userConfig = JSON.parse(await fs.readFile(getMcpConfigPath(), 'utf8')) as { mcpServers: Record<string, unknown> };
    expect(userConfig.mcpServers).toEqual({});
  });
});
