import { afterEach, describe, expect, it, vi } from 'vitest';
import { release } from 'node:os';
import { BrowserWindow, ipcMain } from 'electron';
import { registerWindowHandlers } from '@electron/ipc/platform/system/window';
import { setMacWindowBlur } from '@electron/platform/window/macos-glass';
import { IpcChannels } from '@/types/ipc-channels';

vi.mock('node:os', () => ({ release: vi.fn(() => '10.0.22621') }));
vi.mock('@electron/platform/window/macos-glass', () => ({ setMacWindowBlur: vi.fn() }));
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: vi.fn() },
  nativeTheme: { themeSource: 'system' },
}));
const platform = process.platform;
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform });
  vi.resetAllMocks();
});

function setup(os: string) {
  Object.defineProperty(process, 'platform', { value: os });
  vi.mocked(release).mockReturnValue('10.0.22621');
  const win = { setVibrancy: vi.fn(), setBackgroundMaterial: vi.fn() };
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(win as unknown as BrowserWindow);
  registerWindowHandlers();
  const handler = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) =>
    channel === IpcChannels.window.setGlassEffect)?.[1];
  if (!handler) throw new Error('Missing glass handler');
  const event = { sender: {} } as Electron.IpcMainInvokeEvent;
  return { win, apply: (effect: object) => handler(event, effect, 'light') };
}

describe('native glass controls', () => {
  it('removes native tint and changes direct macOS blur, including clearing it', () => {
    const { win, apply } = setup('darwin');
    for (const radius of [12, 64, 0, 100, NaN]) {
      expect(apply({ enabled: true, opacity: 0, blurRadius: radius })).toBeNull();
    }
    apply({ enabled: false, opacity: 0, blurRadius: 24 });
    expect(vi.mocked(setMacWindowBlur).mock.calls.map(([, radius]) => radius)).toEqual([12, 64, 0, 64, 24, 0]);
    expect(win.setVibrancy).toHaveBeenCalledWith(null);
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });

  it('reports native failure so the editor does not show an ineffective control silently', () => {
    const { apply } = setup('darwin');
    vi.mocked(setMacWindowBlur).mockImplementation(() => { throw new Error('Blur unavailable'); });
    expect(apply({ enabled: true, opacity: 0 })).toBe('Blur unavailable');
  });

  it('uses Windows backdrops without calling the macOS API', () => {
    const { win, apply } = setup('win32');
    for (const windowsMaterial of ['acrylic', 'mica', 'tabbed', 'invalid']) {
      apply({ enabled: true, opacity: 0, windowsMaterial });
    }
    apply({ enabled: false, opacity: 0 });
    expect(win.setBackgroundMaterial.mock.calls).toEqual([['acrylic'], ['mica'], ['tabbed'], ['acrylic'], ['none']]);
    expect(setMacWindowBlur).not.toHaveBeenCalled();
  });

  it('reports unsupported Windows versions instead of silently ignoring blur', () => {
    const { win, apply } = setup('win32');
    vi.mocked(release).mockReturnValue('10.0.19045');
    expect(apply({ enabled: true, opacity: 0 })).toContain('Windows 11 22H2');
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });

  it('keeps Linux independent of native macOS and Windows libraries', () => {
    const { win, apply } = setup('linux');
    expect(apply({ enabled: true, opacity: 0 })).toContain('solid backgrounds');
    expect(apply({ enabled: false, opacity: 0 })).toBeNull();
    expect(setMacWindowBlur).not.toHaveBeenCalled();
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });
});
