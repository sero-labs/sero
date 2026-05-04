import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: vi.fn(),
      },
    },
  },
}));

import { buildContentSecurityPolicy } from '@electron/platform/security/csp';

describe('content security policy', () => {
  it('keeps production script sources tight while allowing only loopback viewer URLs', () => {
    const csp = buildContentSecurityPolicy({ isDevelopment: false });

    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval' blob: https://sdk.scdn.co https://cdn.jsdelivr.net sero-ext:");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-src 'self' blob: http://localhost:* http://127.0.0.1:* http://[::1]:* sero-ext:");
    expect(csp).toContain("child-src 'self' blob: http://localhost:* http://127.0.0.1:* http://[::1]:* sero-ext:");
    expect(csp).toContain("connect-src 'self' blob:");
    expect(csp).toContain("img-src 'self' data: blob: https: http: sero-ext:");
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('http://127.0.0.1:*');
    expect(csp).toContain('http://[::1]:*');
    expect(csp).not.toContain('frame-src http:');
    expect(csp).not.toContain('frame-src https:');
    expect(csp).not.toContain('child-src http:');
  });

  it('preserves dev-time localhost and framed preview allowances', () => {
    const csp = buildContentSecurityPolicy({ isDevelopment: true });

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('ws://localhost:*');
    expect(csp).toContain("frame-src 'self' blob: http: https: sero-ext:");
    expect(csp).toContain("child-src 'self' blob: http: https: sero-ext:");
  });
});
