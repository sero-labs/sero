import { afterEach, describe, expect, it } from 'vitest';
import type { McpServerConfig } from '../config/types';
import { buildRequestInit, McpServerManager, resolveEnv } from '../manager/server-manager';

const managers: McpServerManager[] = [];

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.closeAll()));
});

describe('MCP server manager transport defaults', () => {
  it('preserves the exact environment declared by a user server', () => {
    expect(resolveEnv({ ONLY: 'value' }, false)).toEqual({ ONLY: 'value' });
    expect(resolveEnv({ ONLY: 'value' }, true)).toEqual(expect.objectContaining({
      ONLY: 'value',
      PATH: expect.any(String),
    }));
  });

  it('spawns a literal-env stdio Agent Plugin with the inherited executable path', async () => {
    const manager = new McpServerManager();
    managers.push(manager);
    const server = String.raw`
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf('\n');
  while (newline >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line) {
      const message = JSON.parse(line);
      if (message.id !== undefined) {
        let result = {};
        if (message.method === 'initialize') {
          result = {
            protocolVersion: message.params.protocolVersion,
            capabilities: {},
            serverInfo: { name: 'fixture', version: '1.0.0' },
          };
        } else if (message.method === 'tools/list') {
          result = { tools: [] };
        } else if (message.method === 'resources/list') {
          result = { resources: [] };
        }
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n');
      }
    }
    newline = buffer.indexOf('\n');
  }
});
`;

    const connection = await manager.connect('agent-plugin:fixture:stdio', {
      transport: 'stdio',
      command: 'node',
      args: ['-e', server],
      env: { PLUGIN_ROOT: '/tmp/plugin', PLUGIN_DATA: '/tmp/data' },
      literalEnv: true,
      managedByAgentPlugin: { pluginId: 'ap-fixture', pluginName: 'fixture', serverName: 'stdio' },
    });

    expect(connection.status).toBe('connected');
  });

  it('blocks redirects only for Agent Plugin endpoints', () => {
    expect(buildRequestInit({ transport: 'http', url: 'https://example.com' })).toBeUndefined();
    expect(buildRequestInit({
      transport: 'http',
      url: 'https://example.com',
      headers: { Authorization: 'Bearer token' },
    })).toEqual({ headers: { Authorization: 'Bearer token' } });
    expect(buildRequestInit({
      transport: 'http',
      url: 'https://example.com',
      managedByAgentPlugin: { pluginId: 'ap-fixture', pluginName: 'fixture', serverName: 'remote' },
    } satisfies McpServerConfig)).toEqual({ redirect: 'manual' });
  });
});
