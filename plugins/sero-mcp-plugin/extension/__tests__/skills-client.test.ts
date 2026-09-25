import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { McpServerManager } from '../manager/server-manager';
import { createSkillsClient } from '../skills/skills-client';
import { FIXTURE_PATH, startTaskFixture } from './helpers/task-fixture';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function connect(definition: Parameters<McpServerManager['connect']>[1]) {
  const manager = new McpServerManager();
  cleanups.push(() => manager.closeAll());
  const connection = await manager.connect('docs', definition);
  expect(connection.status).toBe('connected');
  return connection;
}

describe('MCP skills client', () => {
  it.each(['stdio', 'http'] as const)('lists the skills of a server that declares the extension (%s)', async (transport) => {
    let definition: Parameters<McpServerManager['connect']>[1] = { transport: 'stdio', command: process.execPath, args: [FIXTURE_PATH] };
    if (transport === 'http') {
      const fixture = await startTaskFixture();
      cleanups.push(fixture.stop);
      definition = { transport: 'http', url: fixture.url };
    }
    const connection = await connect(definition);

    const skills = createSkillsClient(connection.client!);

    expect(skills?.directoryRead).toBe(true);
    const entries = await skills!.list();
    expect(entries.map((entry) => [entry.frontmatter.name, Array.isArray(entry.resources) ? entry.resources.length : entry.resources]))
      .toEqual([['release-notes', 2], ['daily', 'dynamic']]);
    expect((await skills!.get('skill://docs/release-notes/SKILL.md')).frontmatter.name).toBe('release-notes');
    expect((await skills!.readDirectory('skill://docs/release-notes')).map((child) => child.name)).toEqual(['SKILL.md', 'templates']);
  });

  it('makes no skills client for a server without the extension, even with a skill:// resource', async () => {
    const createServer = () => {
      const server = new McpServer({ name: 'plain', version: '1.0.0' });
      server.registerResource('guide', 'skill://guide/SKILL.md', { mimeType: 'text/markdown' }, async () => ({
        contents: [{ uri: 'skill://guide/SKILL.md', text: '---\nname: guide\ndescription: A guide.\n---\n' }],
      }));
      return server;
    };
    const requests: string[] = [];
    const handler = toNodeHandler(createMcpHandler(createServer));
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const message = body ? JSON.parse(body) as { method?: string } : undefined;
        if (message?.method) requests.push(message.method);
        void handler(req, res, message);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
    const connection = await connect({ transport: 'http', url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp` });

    expect(createSkillsClient(connection.client!)).toBeUndefined();
    expect(requests.filter((method) => method.startsWith('skills/'))).toEqual([]);
  });
});
