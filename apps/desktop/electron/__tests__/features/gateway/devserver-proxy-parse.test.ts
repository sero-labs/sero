import { describe, expect, it } from 'vitest';
import { parseDevProxyPath } from '@electron/features/gateway/server/devserver-proxy';
import {
  buildProxyLocation,
  readQueryTicket,
  rewriteProxyBody,
} from '@electron/features/gateway/server/devserver-proxy-utils';

describe('parseDevProxyPath', () => {
  it('parses a basic preview URL', () => {
    expect(parseDevProxyPath('/p/ws-1/3000/')).toEqual({
      workspaceId: 'ws-1',
      port: 3000,
      rest: '/',
    });
  });

  it('preserves the path remainder and query string', () => {
    expect(parseDevProxyPath('/p/ws-1/5173/src/main.ts?v=42')).toEqual({
      workspaceId: 'ws-1',
      port: 5173,
      rest: '/src/main.ts?v=42',
    });
  });

  it('decodes URL-encoded workspace IDs', () => {
    const result = parseDevProxyPath('/p/my%20ws/3000/');
    expect(result?.workspaceId).toBe('my ws');
  });

  it('rejects paths that do not match the prefix', () => {
    expect(parseDevProxyPath('/api/foo')).toBeNull();
    expect(parseDevProxyPath('/p/')).toBeNull();
    expect(parseDevProxyPath('/p/ws/')).toBeNull();
  });

  it('rejects non-numeric and out-of-range ports', () => {
    expect(parseDevProxyPath('/p/ws-1/abc/')).toBeNull();
    expect(parseDevProxyPath('/p/ws-1/0/')).toBeNull();
    expect(parseDevProxyPath('/p/ws-1/65536/')).toBeNull();
  });

  it('returns "/" as the remainder when no path follows the port', () => {
    expect(parseDevProxyPath('/p/ws-1/3000')).toEqual({
      workspaceId: 'ws-1',
      port: 3000,
      rest: '/',
    });
  });

  it('removes query tickets while preserving the rest of the URL', () => {
    const parsed = parseDevProxyPath('/p/ws-1/5173/dashboard?t=secret&tab=1');
    expect(parsed).not.toBeNull();
    const result = readQueryTicket(parsed!.rest);
    expect(result).toEqual({ ticket: 'secret', restWithoutTicket: '/dashboard?tab=1' });
    expect(buildProxyLocation(parsed!, result.restWithoutTicket)).toBe(
      '/p/ws-1/5173/dashboard?tab=1',
    );
  });

  it('rewrites root-absolute dev server asset paths under the proxy prefix', () => {
    const body = `
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/src/main.tsx"></script>
      <img srcset="/a.png 1x, /b.png 2x" />
      <style>.hero{background:url('/assets/bg.png')}</style>
      <script>import RefreshRuntime from "/@react-refresh"; fetch('/api/me')</script>
    `;
    const rewritten = rewriteProxyBody(body, '/p/ws-1/5173');

    expect(rewritten).toContain('src="/p/ws-1/5173/@vite/client"');
    expect(rewritten).toContain('src="/p/ws-1/5173/src/main.tsx"');
    expect(rewritten).toContain('/p/ws-1/5173/a.png 1x');
    expect(rewritten).toContain("url('/p/ws-1/5173/assets/bg.png')");
    expect(rewritten).toContain('"/p/ws-1/5173/@react-refresh"');
    expect(rewritten).toContain("'/p/ws-1/5173/api/me'");
  });
});
