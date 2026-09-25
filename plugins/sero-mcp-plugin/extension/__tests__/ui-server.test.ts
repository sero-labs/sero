import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiResourceMeta } from '../viewer/types';
import { MAX_VIEWER_SESSIONS, McpUiServer, type UiSessionHandle } from '../viewer/ui-server';

const servers: McpUiServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.closeAll('test-cleanup')));
});

describe('ui-server', () => {
  it('serves the viewer page with a CSP that allows no inline script', async () => {
    const handle = await openViewer(createServer());

    const response = await fetch(handle.viewerUrl);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self';");
    expect(html).toContain('<script type="module" src="/viewer-shell.js"></script>');
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
    expect((await postProxy(second, 'tools/list', {})).status).toBe(200);
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

describe('ui-server app isolation', () => {
  it('gives an app without declared domains no network access', async () => {
    const handle = await openViewer(createServer());

    const csp = (await fetch(appUrl(handle))).headers.get('content-security-policy');

    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("script-src 'unsafe-inline';");
  });

  it('opens only the declared domains and drops values that could change the policy', async () => {
    const handle = await openViewer(createServer(), undefined, undefined, {
      csp: { connectDomains: ['https://api.example.com', "'self'; script-src *"], resourceDomains: ['https://*.cdn.example.com'] },
    });

    const csp = (await fetch(appUrl(handle))).headers.get('content-security-policy');

    expect(csp).toContain('connect-src https://api.example.com;');
    expect(csp).toContain("script-src 'unsafe-inline' https://*.cdn.example.com;");
  });

  it('grants no requested permission by default', async () => {
    const handle = await openViewer(createServer(), undefined, undefined, { permissions: { clipboardWrite: {} } });

    const html = await (await fetch(handle.viewerUrl)).text();

    expect(html).toContain('"allowAttribute":""');
  });

  it('passes granted permissions to the app frame and to the embedding frame', async () => {
    const server = createServer();
    const handle = await server.open({
      serverName: 'demo',
      resourceUri: 'ui://demo/dashboard',
      title: 'Demo dashboard',
      resource: { uri: 'ui://demo/dashboard', html: '<html></html>', mimeType: 'text/html;profile=mcp-app', meta: {} },
      grantedPermissions: { clipboardWrite: {} },
    });

    const html = await (await fetch(handle.viewerUrl)).text();

    expect(handle.allowAttribute).toBe('clipboard-write');
    expect(html).toContain('"allowAttribute":"clipboard-write"');
  });

  it('reports a link as not opened when the user does not open it', async () => {
    const onOpenLink = vi.fn(async () => false);
    const handle = await openViewer(createServer(), undefined, undefined, {}, onOpenLink);

    const body = await (await postProxy(handle, 'ui/open-link', { url: 'https://example.com' })).json();

    expect(onOpenLink).toHaveBeenCalledWith('https://example.com');
    expect(body).toEqual({ ok: true, result: { isError: true } });
  });
});

describe('ui-server app proxy', () => {
  const tools = [
    { name: 'refresh' },
    { name: 'app_only', _meta: { ui: { visibility: ['app'] } } },
    { name: 'model_only', _meta: { ui: { visibility: ['model'] } } },
    { name: 'excluded' },
  ];

  it('lists only the app tools of the owning server', async () => {
    const handle = await openViewer(createServer(createManager(tools)), undefined, ['excluded']);

    const body = await (await postProxy(handle, 'tools/list', {})).json() as { result: { tools: Array<{ name: string }> } };

    expect(body.result.tools.map((tool) => tool.name)).toEqual(['refresh', 'app_only']);
  });

  it.each(['model_only', 'excluded', 'github_create_issue'])('blocks a call to %s and sends no request', async (name) => {
    const manager = createManager(tools);
    const handle = await openViewer(createServer(manager), undefined, ['excluded']);

    const body = await (await postProxy(handle, 'tools/call', { name, arguments: {} })).json() as { result: unknown };

    expect(body.result).toMatchObject({ isError: true, content: [{ text: `Blocked: demo has no app tool "${name}".` }] });
    expect(manager.callTool).not.toHaveBeenCalled();
  });
});

function createServer(manager = createManager()): McpUiServer {
  const server = new McpUiServer(manager as never);
  servers.push(server);
  return server;
}

function openViewer(
  server: McpUiServer,
  onClose?: (reason: string) => void,
  excludeTools?: string[],
  meta: UiResourceMeta = {},
  onOpenLink?: (url: string) => Promise<boolean>,
): Promise<UiSessionHandle> {
  return server.open({
    serverName: 'demo',
    resourceUri: 'ui://demo/dashboard',
    title: 'Demo dashboard',
    resource: {
      uri: 'ui://demo/dashboard',
      html: '<html><body>demo</body></html>',
      mimeType: 'text/html;profile=mcp-app',
      meta,
    },
    excludeTools,
    onOpenLink,
    onClose,
  });
}

function appUrl(handle: UiSessionHandle): URL {
  const url = new URL(handle.viewerUrl);
  url.pathname = '/ui-app';
  return url;
}

function postProxy(handle: UiSessionHandle, method: string, params: unknown): Promise<Response> {
  return fetch(new URL(`/proxy/${method}`, handle.viewerUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: handle.viewerId, params }),
  });
}

function createManager(tools: Array<{ name: string; _meta?: Record<string, unknown> }> = []) {
  return {
    getConnection: vi.fn(() => ({ tools, resources: [] })),
    callTool: vi.fn(async () => ({ isError: false, content: [{ type: 'text', text: 'ok' }] })),
    readResource: vi.fn(async () => ({ contents: [] })),
  };
}
