import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

import {
  hardenMainWindowWebviewPreferences,
  isAllowedMainWindowWebview,
  MCP_AUTH_WEBVIEW_PARTITION,
} from '@electron/platform/security/window-security';

describe('window security webview policy', () => {
  it('allows only the MCP auth partition and trusted auth origins', () => {
    expect(isAllowedMainWindowWebview('https://github.com/login/device', MCP_AUTH_WEBVIEW_PARTITION)).toBe(true);
    expect(isAllowedMainWindowWebview('http://127.0.0.1:3845/callback', MCP_AUTH_WEBVIEW_PARTITION)).toBe(true);
    expect(isAllowedMainWindowWebview('https://evil.example.com', MCP_AUTH_WEBVIEW_PARTITION)).toBe(false);
    expect(isAllowedMainWindowWebview('https://github.com/login/device', 'persist:other')).toBe(false);
  });

  it('strips dangerous webview preferences and forces sandboxed defaults', () => {
    const webPreferences = {
      preload: '/tmp/attack.js',
      preloadURL: '/tmp/attack.js',
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      allowRunningInsecureContent: true,
      webSecurity: false,
      sandbox: false,
      javascript: false,
      partition: 'persist:other',
    } as unknown as Parameters<typeof hardenMainWindowWebviewPreferences>[0];

    hardenMainWindowWebviewPreferences(webPreferences);

    expect((webPreferences as Record<string, unknown>).preload).toBeUndefined();
    expect((webPreferences as Record<string, unknown>).preloadURL).toBeUndefined();
    expect((webPreferences as Record<string, unknown>).nodeIntegration).toBe(false);
    expect((webPreferences as Record<string, unknown>).nodeIntegrationInSubFrames).toBe(false);
    expect((webPreferences as Record<string, unknown>).contextIsolation).toBe(true);
    expect((webPreferences as Record<string, unknown>).allowRunningInsecureContent).toBe(false);
    expect((webPreferences as Record<string, unknown>).webSecurity).toBe(true);
    expect((webPreferences as Record<string, unknown>).sandbox).toBe(true);
    expect((webPreferences as Record<string, unknown>).javascript).toBe(true);
    expect((webPreferences as Record<string, unknown>).partition).toBe(MCP_AUTH_WEBVIEW_PARTITION);
  });
});
