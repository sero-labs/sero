import { release } from 'node:os';
import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { CHROME_BAR_HEIGHT } from '@electron/chrome';
import { setMacWindowBlur } from '@electron/platform/window/macos-glass';
import { DEFAULT_GLASS_EFFECT, WINDOWS_GLASS_MATERIALS, type ThemeGlassEffect, type ThemeMode } from '@/types/theme';

function windowOf(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerWindowHandlers(): void {
  ipcMain.handle(IpcChannels.window.minimize, (event) => {
    windowOf(event)?.minimize();
  });

  ipcMain.handle(IpcChannels.window.toggleMaximize, (event) => {
    const win = windowOf(event);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle(IpcChannels.window.close, (event) => {
    windowOf(event)?.close();
  });

  ipcMain.handle(IpcChannels.window.isMaximized, (event) => {
    return windowOf(event)?.isMaximized() ?? false;
  });

  // Windows draws the native overlay buttons; their colors must follow the
  // renderer theme. No-op elsewhere.
  ipcMain.handle(
    IpcChannels.window.setOverlayColors,
    (event, colors: { color: string; symbolColor: string }) => {
      if (process.platform !== 'win32') return;
      if (typeof colors?.color !== 'string' || typeof colors?.symbolColor !== 'string') return;
      windowOf(event)?.setTitleBarOverlay({
        color: colors.color,
        symbolColor: colors.symbolColor,
        height: CHROME_BAR_HEIGHT,
      });
    },
  );

  ipcMain.handle(
    IpcChannels.window.setGlassEffect,
    (event, effect: ThemeGlassEffect, appearance: ThemeMode): string | null => {
      if (
        typeof effect?.enabled !== 'boolean' ||
        typeof effect?.opacity !== 'number' ||
        !['light', 'dark', 'system'].includes(appearance)
      ) {
        return 'Invalid glass settings.';
      }

      const win = windowOf(event);
      if (!win) return 'The window is not available.';

      try {
        nativeTheme.themeSource = appearance;
        if (process.platform === 'darwin') {
          win.setVibrancy(null);
          const radius = typeof effect.blurRadius === 'number' && Number.isFinite(effect.blurRadius)
            ? Math.round(Math.max(0, Math.min(64, effect.blurRadius)))
            : DEFAULT_GLASS_EFFECT.blurRadius;
          setMacWindowBlur(win, effect.enabled ? radius : 0);
        } else if (process.platform === 'win32') {
          if (effect.enabled && Number(release().split('.')[2]) < 22621) {
            return 'Desktop glass requires Windows 11 22H2 or later. Sero uses solid backgrounds.';
          }
          const material = WINDOWS_GLASS_MATERIALS.find((candidate) => candidate === effect.windowsMaterial)
            ?? DEFAULT_GLASS_EFFECT.windowsMaterial;
          win.setBackgroundMaterial(effect.enabled ? material : 'none');
        } else if (effect.enabled) {
          return 'Desktop blur is not available on this Linux compositor. Sero uses solid backgrounds.';
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Desktop blur is not available.';
      }
    },
  );
}

/** Push maximize/restore transitions to the renderer (Linux window controls). */
export function forwardWindowStateEvents(win: BrowserWindow): void {
  const send = () => {
    if (win.isDestroyed()) return;
    win.webContents.send(IpcChannels.window.maximizedChanged, win.isMaximized());
  };
  win.on('maximize', send);
  win.on('unmaximize', send);
}
