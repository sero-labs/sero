import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  BrowserWindow: vi.fn(),
  markAuxiliaryWindow: vi.fn(),
}));

vi.mock('electron', () => ({ BrowserWindow: mocks.BrowserWindow }));
vi.mock('@electron/shared/auxiliary-window', () => ({
  markAuxiliaryWindow: mocks.markAuxiliaryWindow,
}));

import {
  captureUrlHeadless,
  isCapturableUrl,
  HEADLESS_CAPTURE_TIMEOUT_MS,
} from '@electron/features/apps/app-control/headless-capture';

type Listener = (...args: unknown[]) => void;
/** Emits an event to the window, as Electron does during a load. */
type Emit = (event: string, ...args: unknown[]) => void;

interface FakeWindow {
  loadURL: ReturnType<typeof vi.fn>;
  webContents: {
    setWindowOpenHandler: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    capturePage: ReturnType<typeof vi.fn>;
    session: {
      setPermissionRequestHandler: ReturnType<typeof vi.fn>;
      setPermissionCheckHandler: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
    };
  };
  isDestroyed: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function fakeWindow(options: {
  /** What the fake load does. The default finishes loading on the next tick. */
  load?: (emit: Emit) => Promise<void> | void;
  image?: { isEmpty: () => boolean; toPNG: () => Buffer } | null;
} = {}): FakeWindow {
  const listeners = new Map<string, Set<Listener>>();
  const emit: Emit = (event, ...args) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };
  const on = vi.fn((event: string, listener: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
  });
  const off = vi.fn((event: string, listener: Listener) => {
    listeners.get(event)?.delete(listener);
  });
  return {
    // A real loadURL rejects on a failed or replaced navigation and fires
    // `did-finish-load` for the document that ends up loaded.
    loadURL: vi.fn(options.load ?? (() => new Promise<void>((resolve) => {
      setTimeout(() => { emit('did-finish-load', {}); resolve(); }, 1);
    }))),
    webContents: {
      setWindowOpenHandler: vi.fn(),
      on,
      off,
      capturePage: vi.fn(() => Promise.resolve(options.image === null
        ? { isEmpty: () => true, toPNG: () => Buffer.alloc(0) }
        : options.image ?? { isEmpty: () => false, toPNG: () => Buffer.from('png-bytes') })),
      session: {
        setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
      },
    },
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
  };
}

function useWindow(win: FakeWindow): void {
  mocks.BrowserWindow.mockImplementation(function (this: unknown) { return win; });
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
    useWindow(win);

    const result = await captureUrlHeadless('http://127.0.0.1:5173');

    const options = mocks.BrowserWindow.mock.calls[0]?.[0] as { show: boolean; webPreferences: Record<string, unknown> };
    expect(options.show).toBe(false);
    expect(options.webPreferences).toMatchObject({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      // A native dialog from a window the user cannot see would hold the capture.
      disableDialogs: true,
    });
    // No user session data is read or left behind.
    expect(String(options.webPreferences.partition)).not.toMatch(/^persist:/);
    // Marked before it loads, so no lookup can take it for the Sero window.
    expect(mocks.markAuxiliaryWindow).toHaveBeenCalledWith(win);
    expect(win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173');
    expect(result).toMatchObject({ ok: true, url: 'http://127.0.0.1:5173' });
    expect(Buffer.from(result.base64 ?? '', 'base64').toString()).toBe('png-bytes');
    expect(win.destroy).toHaveBeenCalled();
  });

  it('denies child windows, non-web navigation, permissions and downloads', async () => {
    const win = fakeWindow();
    useWindow(win);
    await captureUrlHeadless('http://127.0.0.1:5173');

    const openHandler = win.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as () => { action: string };
    expect(openHandler()).toEqual({ action: 'deny' });

    // Both a frame navigation and a server redirect are navigations.
    for (const event of ['will-frame-navigate', 'will-redirect']) {
      const listener = listenerOf(win, event);
      expect(listener, event).toBeDefined();
      const blocked = { preventDefault: vi.fn(), url: 'file:///etc/passwd' };
      listener?.(blocked);
      expect(blocked.preventDefault, event).toHaveBeenCalled();
      const allowed = { preventDefault: vi.fn(), url: 'http://127.0.0.1:5173/play' };
      listener?.(allowed);
      expect(allowed.preventDefault, event).not.toHaveBeenCalled();
    }

    // Nothing a project page asks for is granted in a hidden window.
    const request = win.webContents.session.setPermissionRequestHandler.mock.calls[0]?.[0] as (
      contents: unknown, permission: string, callback: (granted: boolean) => void,
    ) => void;
    const granted = vi.fn();
    request(null, 'media', granted);
    expect(granted).toHaveBeenCalledWith(false);
    const check = win.webContents.session.setPermissionCheckHandler.mock.calls[0]?.[0] as () => boolean;
    expect(check()).toBe(false);

    // A download would open a save dialog nobody can see.
    const download = win.webContents.session.on.mock.calls.find((call) => call[0] === 'will-download')?.[1] as (event: { preventDefault: () => void }) => void;
    expect(download).toBeDefined();
    const downloadEvent = { preventDefault: vi.fn() };
    download(downloadEvent);
    expect(downloadEvent.preventDefault).toHaveBeenCalled();
  });

  it('captures a page that redirects while it loads', async () => {
    const win = fakeWindow({
      // The first navigation is replaced, which Electron reports as an abort.
      load: () => {
        setTimeout(() => {
          const finish = listenerOf(win, 'did-finish-load');
          finish?.({});
        }, 1);
        return Promise.reject(new Error('ERR_ABORTED (-3) loading http://127.0.0.1:5173'));
      },
    });
    useWindow(win);

    const result = await captureUrlHeadless('http://127.0.0.1:5173');

    expect(result.ok).toBe(true);
    expect(win.webContents.capturePage).toHaveBeenCalled();
  });

  it('reports a load that really fails', async () => {
    const win = fakeWindow({
      load: () => {
        setTimeout(() => {
          const fail = listenerOf(win, 'did-fail-load');
          fail?.({}, -105, 'NAME_NOT_RESOLVED', 'http://127.0.0.1:5173', true);
        }, 1);
        return Promise.reject(new Error('ERR_NAME_NOT_RESOLVED (-105) loading http://127.0.0.1:5173'));
      },
    });
    useWindow(win);

    const result = await captureUrlHeadless('http://127.0.0.1:5173');

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('NAME_NOT_RESOLVED') });
    expect(win.webContents.capturePage).not.toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalled();
  });

  it('fails at once when a redirect leaves the web, rather than waiting for the limit', async () => {
    const win = fakeWindow({ load: () => new Promise<void>(() => undefined) });
    useWindow(win);
    const pending = captureUrlHeadless('http://127.0.0.1:5173');
    // Sero blocks the navigation, so no load will ever finish.
    listenerOf(win, 'will-redirect')?.({ preventDefault: vi.fn(), url: 'vscode://file/etc/hosts' });

    const result = await pending;

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('vscode://file/etc/hosts') });
    expect(result.error).not.toContain('Timed out');
    expect(win.webContents.capturePage).not.toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalled();
  });

  it('fails at once when the page starts a download, and stops watching afterwards', async () => {
    const win = fakeWindow({ load: () => new Promise<void>(() => undefined) });
    useWindow(win);
    const pending = captureUrlHeadless('http://127.0.0.1:5173');
    const download = win.webContents.session.on.mock.calls.find((call) => call[0] === 'will-download')?.[1] as (event: { preventDefault: () => void }) => void;
    const event = { preventDefault: vi.fn() };
    download(event);

    const result = await pending;

    expect(event.preventDefault).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('download') });
    // The listener is per capture, so a session shared by later captures keeps none.
    expect(win.webContents.session.off).toHaveBeenCalledWith('will-download', download);
  });

  it('fails when the page never finishes loading, and closes the window', async () => {
    const win = fakeWindow({ load: () => new Promise<void>(() => undefined) });
    useWindow(win);

    const result = await captureUrlHeadless('http://127.0.0.1:5173', { timeoutMs: 20 });

    expect(result).toMatchObject({ ok: false, error: 'Timed out after 0s' });
    expect(win.destroy).toHaveBeenCalled();
    expect(win.webContents.capturePage).not.toHaveBeenCalled();
    // The default budget is a real number of seconds, not zero.
    expect(HEADLESS_CAPTURE_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });

  it('fails on an empty image rather than saving a blank proof', async () => {
    const win = fakeWindow({ image: null });
    useWindow(win);

    const result = await captureUrlHeadless('http://127.0.0.1:5173');

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('empty image') });
    expect(win.destroy).toHaveBeenCalled();
  });
});
