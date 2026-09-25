import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIEWER_SESSIONS, McpUiServer, type UiSessionHandle } from '../viewer/ui-server';

const servers: McpUiServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.closeAll('test-cleanup')));
});

describe('ui-server', () => {
  it('serves the viewer shell with a CSP header and sandboxed bridge-only iframe', async () => {
    const handle = await openViewer(createServer());

    const response = await fetch(handle.viewerUrl);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-src 'self'");
    expect(html).toContain("sandbox', 'allow-scripts allow-forms allow-popups allow-downloads'");
    expect(html).not.toContain("sandbox', 'allow-scripts allow-same-origin");
  });

  it('rejects host-page requests without the viewer session token', async () => {
    const handle = await openViewer(createServer());
    const url = new URL(handle.viewerUrl);
    url.search = '';

    const response = await fetch(url);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid viewer session token' });
  });

  it('rejects proxy requests without the viewer session token in the body', async () => {
    const handle = await openViewer(createServer());
    const url = new URL('/proxy/tools/list', handle.viewerUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: {} }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid viewer session token' });
  });

  it('closes one of two sessions without affecting the other', async () => {
    const server = createServer();
    const first = await openViewer(server);
    const second = await openViewer(server);

    expect(server.close(first.viewerId)).toBe(true);

    expect((await fetch(first.viewerUrl)).status).toBe(403);
    expect((await fetch(second.viewerUrl)).status).toBe(200);
    expect((await postTools(second)).status).toBe(200);
  });

  it('closes the oldest session when the session limit is reached', async () => {
    const server = createServer();
    const closed: string[] = [];
    const handles: UiSessionHandle[] = [];
    for (let index = 0; index <= MAX_VIEWER_SESSIONS; index += 1) {
      handles.push(await openViewer(server, (reason) => closed.push(reason)));
    }

    expect(closed).toEqual(['session-limit']);
    expect(server.has(handles[0].viewerId)).toBe(false);
    expect(server.has(handles[MAX_VIEWER_SESSIONS].viewerId)).toBe(true);
  });
});

function createServer(): McpUiServer {
  const server = new McpUiServer(createManager() as never);
  servers.push(server);
  return server;
}

function openViewer(server: McpUiServer, onClose?: (reason: string) => void): Promise<UiSessionHandle> {
  return server.open({
    serverName: 'demo',
    resourceUri: 'ui://demo/dashboard',
    title: 'Demo dashboard',
    resource: {
      uri: 'ui://demo/dashboard',
      html: '<html><body>demo</body></html>',
      mimeType: 'text/html;profile=mcp-app',
      meta: {},
    },
    onClose,
  });
}

function postTools(handle: UiSessionHandle): Promise<Response> {
  return fetch(new URL('/proxy/tools/list', handle.viewerUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: handle.viewerId, params: {} }),
  });
}

function createManager() {
  return {
    getConnection: vi.fn(() => ({ tools: [], resources: [] })),
    callTool: vi.fn(async () => ({ isError: false, content: [{ type: 'text', text: 'ok' }] })),
    readResource: vi.fn(async () => ({ contents: [] })),
  };
}
