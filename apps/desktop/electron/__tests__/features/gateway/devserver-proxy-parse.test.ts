import { describe, expect, it } from 'vitest';
import { parseDevProxyPath } from '@electron/features/gateway/server/devserver-proxy';

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
});
