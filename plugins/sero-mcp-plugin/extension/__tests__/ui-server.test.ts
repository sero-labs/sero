import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiServerHandle } from '../viewer/ui-server';
import { startUiServer } from '../viewer/ui-server';

const activeHandles: UiServerHandle[] = [];

afterEach(() => {
  while (activeHandles.length > 0) {
    activeHandles.pop()?.close('test-cleanup');
  }
});

describe('ui-server', () => {
  it('serves the viewer shell with a CSP header and sandboxed bridge-only iframe', async () => {
    const handle = await openViewerServer();

    const response = await fetch(handle.viewerUrl);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-src 'self'");
    expect(html).toContain("sandbox', 'allow-scripts allow-forms allow-popups allow-downloads'");
    expect(html).not.toContain("sandbox', 'allow-scripts allow-same-origin");
  });

  it('rejects host-page requests without the viewer session token', async () => {
    const handle = await openViewerServer();
    const url = new URL(handle.viewerUrl);
    url.search = '';

    const response = await fetch(url);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid viewer session token' });
  });

  it('rejects proxy requests without the viewer session token in the body', async () => {
    const handle = await openViewerServer();
    const url = new URL('/proxy/tools/list', handle.viewerUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: {} }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid viewer session token' });
  });
});

async function openViewerServer(): Promise<UiServerHandle> {
  const handle = await startUiServer({
    serverName: 'demo',
    resourceUri: 'ui://demo/dashboard',
    title: 'Demo dashboard',
    resource: {
      uri: 'ui://demo/dashboard',
      html: '<html><body>demo</body></html>',
      mimeType: 'text/html;profile=mcp-app',
      meta: {},
    },
    manager: createManager() as never,
  });

  activeHandles.push(handle);
  return handle;
}

function createManager() {
  return {
    getConnection: vi.fn(() => ({ tools: [], resources: [] })),
    callTool: vi.fn(async () => ({ isError: false, content: [{ type: 'text', text: 'ok' }] })),
    readResource: vi.fn(async () => ({ contents: [] })),
  };
}
