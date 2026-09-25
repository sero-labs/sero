import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { McpServerManager } from '../manager/server-manager';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/**
 * Answers every POST to "/" with `postStatus`. It also serves the deprecated
 * SSE protocol: GET "/" opens the stream and POST "/messages" takes requests.
 */
async function startServer(postStatus: number) {
  const requests: string[] = [];
  let stream: http.ServerResponse | null = null;
  const server = http.createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    if (req.method === 'GET' && req.url === '/') {
      stream = res;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('event: endpoint\ndata: /messages\n\n');
      return;
    }
    if (req.method === 'POST' && req.url === '/messages') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(202).end();
        const message = JSON.parse(body);
        if (message.id === undefined) return;
        const reply: Record<string, unknown> = { jsonrpc: '2.0', id: message.id };
        if (message.method === 'initialize') {
          reply.result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'sse', version: '1.0.0' } };
        } else if (message.method === 'tools/list') {
          reply.result = { tools: [{ name: 'ping', inputSchema: { type: 'object' } }] };
        } else {
          reply.error = { code: -32601, message: 'Method not found' };
        }
        stream?.write(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
      });
      return;
    }
    res.writeHead(postStatus).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    stream?.end();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, requests };
}

function createManager() {
  const manager = new McpServerManager();
  cleanups.push(() => manager.closeAll());
  return manager;
}

describe('MCP server manager SSE fallback', () => {
  it('does not fall back to SSE when Streamable HTTP fails with a server error', async () => {
    const { url, requests } = await startServer(500);
    const connection = await createManager().connect('broken', { transport: 'http', url });

    expect(connection.status).toBe('error');
    expect(connection.failurePhase).toBe('discovery');
    expect(requests.some((request) => request.startsWith('GET'))).toBe(false);
  });

  it('reports an authorization failure and does not treat the server as legacy', async () => {
    const { url, requests } = await startServer(401);
    const connection = await createManager().connect('locked', { transport: 'http', url });

    expect(connection.status).toBe('error');
    expect(connection.failurePhase).toBe('auth');
    expect(requests.some((request) => request.startsWith('GET'))).toBe(false);
  });

  it('falls back to SSE on 405 and marks the transport as deprecated', async () => {
    const { url } = await startServer(405);
    const connection = await createManager().connect('old', { transport: 'http', url });

    expect(connection.status).toBe('connected');
    expect(connection.tools.map((tool) => tool.name)).toEqual(['ping']);
    expect(connection.protocol).toMatchObject({ era: 'legacy', deprecatedTransport: true });
  });
});
