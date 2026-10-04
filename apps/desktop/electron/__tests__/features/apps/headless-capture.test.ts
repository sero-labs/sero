import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ BrowserWindow: vi.fn() }));

vi.mock('electron', () => ({ BrowserWindow: mocks.BrowserWindow }));

import {
  captureUrlHeadless,
  isCapturableUrl,
  HEADLESS_CAPTURE_TIMEOUT_MS,
} from '@electron/features/apps/app-control/headless-capture';

type Listener = (event: { preventDefault: () => void }, target: string) => void;

interface FakeWindow {
  loadURL: ReturnType<typeof vi.fn>;
  webContents: {
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    capturePage: ReturnType<typeof vi.fn>;
    session: {
      setPermissionRequestHandler: ReturnType<typeof vi.fn>;
      setPermissionCheckHandler: ReturnType<typeof vi.fn>;
    };
  };
  isDestroyed: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function fakeWindow(options: {
  loadURL?: () => Promise<void>;
  image?: { isEmpty: () => boolean; toPNG: () => Buffer } | null;
} = {}): FakeWindow {
  return {
    loadURL: vi.fn(options.loadURL ?? (() => Promise.resolve())),
    webContents: {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      capturePage: vi.fn(() => Promise.resolve(options.image === null
        ? { isEmpty: () => true, toPNG: () => Buffer.alloc(0) }
        : options.image ?? { isEmpty: () => false, toPNG: () => Buffer.from('png-bytes') })),
      session: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
      },
    },
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
  };
}

function listenerOf(win: FakeWindow, event: string): Listener | undefined {
  const entry = win.webContents.on.mock.calls.find((call) => call[0] === event);
  return entry?.[1] as Listener | undefined;
}

describe('headless preview capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts only http and https URLs', () => {
    expect(isCapturableUrl('http://127.0.0.1:5173')).toBe(true);
    expect(isCapturableUrl('https://example.test/app')).toBe(true);
    // A local scheme would read Sero's own disk through a window nothing watches.
    expect(isCapturableUrl('file:///etc/passwd')).toBe(false);
    expect(isCapturableUrl('javascript:alert(1)')).toBe(false);
    expect(isCapturableUrl('devserver://http://127.0.0.1:5173')).toBe(false);
    expect(isCapturableUrl('not a url')).toBe(false);
  });

  it('refuses a non-web URL before any window exists', async () => {
    const result = await captureUrlHeadless('file:///etc/passwd');

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Only http and https') });
    expect(mocks.BrowserWindow).not.toHaveBeenCalled();
  });

  it('captures in a hidden, sandboxed window and closes it', async () => {
    const win = fakeWindow();
    mocks.BrowserWindow.mockImplementation(function (this: unknown) { return win; });

    const result = await captureUrlHeadless('http://127.0.0.1:5173');

    const options = mocks.BrowserWindow.mock.calls[0]?.[0] as { show: boolean; webPreferences: Record<string, unknown> };
    expect(options.show).toBe(false);
    expect(options.webPreferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    });
    // No user session data is read or left behind.
    expect(String(options.webPreferences.partition)).not.toMatch(/^persist:/);
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173');
    expect(result).toMatchObject({ ok: true, url: 'http://127.0.0.1:5173' });
    expect(Buffer.from(result.base64 ?? '', 'base64').toString()).toBe('png-bytes');
    expect(win.destroy).toHaveBeenCalled();
  });

  it('denies child windows and local navigation from the captured page', async () => {
    const win = fakeWindow();
    mocks.BrowserWindow.mockImplementation(function (this: unknown) { return win; });
    await captureUrlHeadless('http://127.0.0.1:5173');

    const openHandler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as () => { action: string };
    expect(openHandler()).toEqual({ action: 'deny' });

    const willNavigate = listenerOf(win, 'will-navigate');
    expect(willNavigate).toBeDefined();
    const blocked = { preventDefault: vi.fn() };
    willNavigate?.(blocked, 'file:///etc/passwd');
    expect(blocked.preventDefault).toHaveBeenCalled();
    const allowed = { preventDefault: vi.fn() };
    willNavigate?.(allowed, 'http://127.0.0.1:5173/play');
    expect(allowed.preventDefault).not.toHaveBeenCalled();

    // Nothing a project page asks for is granted in a hidden window.
    const request = win.webContents.session.setPermissionRequestHandler.mock.calls[0]?.[0] as (
      contents: unknown, permission: string, callback: (granted: boolean) => void,
    ) => void;
    const granted = vi.fn();
    request(null, 'media', granted);
    expect(granted).toHaveBeenCalledWith(false);
    const check = win.webContents.session.setPermissionCheckHandler.mock.calls[0]?.[0] as () => boolean;
    expect(check()).toBe(false);
  });

  it('fails when the page never finishes loading, and closes the window', async () => {
    const win = fakeWindow({ loadURL: () => new Promise<void>(() => undefined) });
    mocks.BrowserWindow.mockImplementation(function (this: unknown) { return win; });

    const result = await captureUrlHeadless('http://127.0.0.1:5173', { timeoutMs: 20 });

    expect(result).toMatchObject({ ok: false, error: 'Timed out after 0s' });
    expect(win.destroy).toHaveBeenCalled();
    expect(win.webContents.capturePage).not.toHaveBeenCalled();
    // The default budget is a real number of seconds, not zero.
    expect(HEADLESS_CAPTURE_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('fails on an empty image rather than saving a blank proof', async () => {
    const win = fakeWindow({ image: null });
    mocks.BrowserWindow.mockImplementation(function (this: unknown) { return win; });

    const result = await captureUrlHeadless('http://127.0.0.1:5173');

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('empty image') });
    expect(win.destroy).toHaveBeenCalled();
  });
});
