import http from 'http';
import { afterEach, describe, expect, it } from 'vitest';

import { WebChatServer } from '@electron/features/gateway/channels/web';

interface TestResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

async function request(port: number, pathname: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'GET',
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

function getServerPort(server: WebChatServer): number {
  const httpServer = (server as unknown as { server: http.Server | null }).server;
  const address = httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected bound web chat server address');
  }
  return address.port;
}

describe('WebChatServer ownership model', () => {
  const activeServers: WebChatServer[] = [];

  afterEach(async () => {
    while (activeServers.length > 0) {
      const server = activeServers.pop();
      if (!server) continue;
      await server.stop();
    }
  });

  it('redirects root traffic to the gateway SPA owner', async () => {
    const server = new WebChatServer({
      port: 0,
      host: '127.0.0.1',
      gatewayWsUrl: 'ws://127.0.0.1:18800',
    });
    activeServers.push(server);

    await server.start();

    const response = await request(getServerPort(server), '/');
    expect(response.statusCode).toBe(307);
    expect(response.headers.location).toBe('http://127.0.0.1:18800/');
  });

  it('keeps /basic as an explicit diagnostics fallback surface', async () => {
    const server = new WebChatServer({
      port: 0,
      host: '127.0.0.1',
      gatewayWsUrl: 'ws://127.0.0.1:18800',
    });
    activeServers.push(server);

    await server.start();

    const response = await request(getServerPort(server), '/basic');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Basic Fallback');
    expect(response.headers['content-type']).toContain('text/html');
  });
});
