import { shell } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

import {
  hardenMainWindowWebviewPreferences,
  isAllowedExternalUrl,
  isAllowedMainWindowWebview,
  MCP_AUTH_WEBVIEW_PARTITION,
  setupMainWindowSecurity,
} from '@electron/platform/security/window-security';

describe('window security external URL policy', () => {
  it('allows only http and https URLs', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(true);
    expect(isAllowedExternalUrl('http://localhost:5173')).toBe(true);
    expect(isAllowedExternalUrl('file:///tmp/index.html')).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedExternalUrl('data:text/html,<h1>x</h1>')).toBe(false);
    expect(isAllowedExternalUrl('not a url')).toBe(false);
    expect(isAllowedExternalUrl('')).toBe(false);
    expect(isAllowedExternalUrl(42)).toBe(false);
  });

  it('uses the shared validator for main-window open-window requests', () => {
    const setWindowOpenHandler = vi.fn();
    const mainWindow = {
      webContents: {
        on: vi.fn(),
        setWindowOpenHandler,
        session: { setPermissionRequestHandler: vi.fn() },
      },
    } as unknown as Parameters<typeof setupMainWindowSecurity>[0];

    setupMainWindowSecurity(mainWindow, { isDevelopment: false });

    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as ((details: { url: string }) => { action: 'deny' }) | undefined;
    if (!handler) throw new Error('Expected window open handler');

    expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    expect(handler({ url: 'file:///tmp/index.html' })).toEqual({ action: 'deny' });
    expect(shell.openExternal).toHaveBeenCalledTimes(1);
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com');
  });
});

describe('window security webview policy', () => {
  it('allows only the MCP auth partition plus https and loopback auth sources', () => {
    expect(isAllowedMainWindowWebview('https://github.com/login/device', MCP_AUTH_WEBVIEW_PARTITION)).toBe(true);
    expect(isAllowedMainWindowWebview('https://oauth.example.com/authorize', MCP_AUTH_WEBVIEW_PARTITION)).toBe(true);
    expect(isAllowedMainWindowWebview('http://127.0.0.1:3845/callback', MCP_AUTH_WEBVIEW_PARTITION)).toBe(true);
    expect(isAllowedMainWindowWebview('http://evil.example.com', MCP_AUTH_WEBVIEW_PARTITION)).toBe(false);
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
