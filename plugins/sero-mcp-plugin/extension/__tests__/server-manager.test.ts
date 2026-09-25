import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { McpServerConfig } from '../config/types';
import { createFileEraVerdictStore } from '../manager/era-verdicts';
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

// A 2025-only stdio server that logs every request method to $METHOD_LOG.
const LEGACY_LOGGING_SERVER = String.raw`
const fs = require('node:fs');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf('\n');
  while (newline >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf('\n');
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id === undefined) continue;
    fs.appendFileSync(process.env.METHOD_LOG, message.method + '\n');
    const reply = { jsonrpc: '2.0', id: message.id };
    if (message.method === 'initialize') {
      reply.result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'legacy', version: '1.0.0' } };
    } else if (message.method === 'tools/list') {
      reply.result = { tools: [] };
    } else {
      reply.error = { code: -32601, message: 'Method not found' };
    }
    process.stdout.write(JSON.stringify(reply) + '\n');
  }
});
`;

describe('MCP server manager era negotiation', () => {
  it('skips the discovery probe for a server with a saved legacy verdict', async () => {
    const logPath = path.join(await mkdtemp(path.join(tmpdir(), 'mcp-era-')), 'methods.log');
    const definition: McpServerConfig = {
      transport: 'stdio',
      command: process.execPath,
      args: ['-e', LEGACY_LOGGING_SERVER],
      env: { METHOD_LOG: logPath },
    };
    const probes = async () => (await readFile(logPath, 'utf8')).split('\n').filter((method) => method === 'server/discover').length;
    const manager = new McpServerManager();
    managers.push(manager);

    const first = await manager.connect('legacy', definition);
    expect(first.status).toBe('connected');
    expect(first.protocol).toMatchObject({ era: 'legacy', version: '2025-06-18', eraFromVerdict: false });
    const probesAfterFirst = await probes();
    expect(probesAfterFirst).toBeGreaterThan(0);

    await manager.close('legacy');
    const second = await manager.connect('legacy', definition);
    expect(second.protocol).toMatchObject({ era: 'legacy', eraFromVerdict: true });
    expect(await probes()).toBe(probesAfterFirst);

    await manager.reconnect('legacy', definition, { reprobe: true });
    expect(await probes()).toBeGreaterThan(probesAfterFirst);
  });

  it('keeps a legacy verdict on disk for the config hash that produced it', async () => {
    const filePath = path.join(await mkdtemp(path.join(tmpdir(), 'mcp-era-')), 'era-verdicts.json');
    await createFileEraVerdictStore(filePath).setLegacy('crm', 'hash-a');

    const reloaded = createFileEraVerdictStore(filePath);
    expect(await reloaded.isLegacy('crm', 'hash-a')).toBe(true);
    expect(await reloaded.isLegacy('crm', 'hash-b')).toBe(false);
    await reloaded.clear('crm');
    expect(await createFileEraVerdictStore(filePath).isLegacy('crm', 'hash-a')).toBe(false);
  });
});
