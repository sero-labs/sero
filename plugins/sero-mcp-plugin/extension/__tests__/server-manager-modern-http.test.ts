import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from '@modelcontextprotocol/client';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpServerManager } from '../manager/server-manager';

interface RecordedRequest {
  headers: http.IncomingHttpHeaders;
  body: { method?: string; params?: { _meta?: Record<string, unknown> } };
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function createServer() {
  const server = new McpServer({ name: 'modern-fixture', version: '1.0.0' });
  server.registerTool('echo', { inputSchema: { message: z.string() } }, async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }));
  server.registerTool('slow', { inputSchema: { label: z.string() } }, async ({ label }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { content: [{ type: 'text', text: label }] };
  });
  return server;
}

/** A modern Streamable HTTP server that records each request. */
async function startServer() {
  const requests: RecordedRequest[] = [];
  const handler = toNodeHandler(createMcpHandler(createServer));
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ headers: req.headers, body });
      void handler(req, res, raw ? body : undefined);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, requests };
}

async function connect(url: string) {
  const manager = new McpServerManager();
  cleanups.push(() => manager.closeAll());
  const connection = await manager.connect('modern', { transport: 'http', url });
  expect(connection.protocol?.era).toBe('modern');
  return manager;
}

describe('MCP server manager on a modern HTTP server', () => {
  it('sends the routing headers and the request envelope', async () => {
    const { url, requests } = await startServer();
    const manager = await connect(url);

    await manager.callTool('modern', 'echo', { message: 'hi' });

    const call = requests.find((request) => request.body.method === 'tools/call');
    expect(call?.headers['mcp-protocol-version']).toBe('2026-07-28');
    expect(call?.headers['mcp-method']).toBe('tools/call');
    expect(call?.headers['mcp-name']).toBe('echo');
    expect(call?.body.params?._meta).toMatchObject({
      [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
      [CLIENT_INFO_META_KEY]: expect.objectContaining({ name: 'sero-mcp-modern' }),
      [CLIENT_CAPABILITIES_META_KEY]: expect.any(Object),
    });
    expect(requests.every((request) => request.headers['mcp-session-id'] === undefined)).toBe(true);
  });

  it('cancels one of two calls and lets the other complete', async () => {
    const { url } = await startServer();
    const manager = await connect(url);
    const controller = new AbortController();

    const stopped = manager.callTool('modern', 'slow', { label: 'first' }, { signal: controller.signal });
    const kept = manager.callTool('modern', 'slow', { label: 'second' });
    setTimeout(() => controller.abort(), 50);

    await expect(stopped).rejects.toThrow();
    await expect(kept).resolves.toMatchObject({ content: [{ type: 'text', text: 'second' }] });
  });
});
