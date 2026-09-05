import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { CHROME_BAR_HEIGHT } from '@electron/chrome';
import type { ThemeGlassEffect, ThemeMode } from '@/types/theme';

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
    (event, effect: ThemeGlassEffect, appearance: ThemeMode) => {
      if (
        typeof effect?.enabled !== 'boolean' ||
        typeof effect?.opacity !== 'number' ||
        !['light', 'dark', 'system'].includes(appearance)
      ) {
        return;
      }

      const win = windowOf(event);
      if (!win) return;

      nativeTheme.themeSource = appearance;
      if (process.platform === 'darwin') {
        win.setVibrancy(effect.enabled ? 'under-window' : null);
      } else if (process.platform === 'win32') {
        win.setBackgroundMaterial(effect.enabled ? 'acrylic' : 'none');
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
