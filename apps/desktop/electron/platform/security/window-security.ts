import { BrowserWindow, shell } from 'electron';

interface SetupMainWindowSecurityOptions {
  isDevelopment: boolean;
}

const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-sanitized-write']);

export function setupMainWindowSecurity(
  mainWindow: BrowserWindow,
  options: SetupMainWindowSecurityOptions,
): void {
  const { isDevelopment } = options;

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol === 'file:') return;
      if (isDevelopment && parsed.origin === 'http://localhost:5173') return;
      console.warn(`[security] Blocked navigation to untrusted origin: ${navigationUrl}`);
      event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (ALLOWED_PERMISSIONS.has(permission)) {
        callback(true);
        return;
      }
      console.warn(`[security] Denied permission request: ${permission}`);
      callback(false);
    },
  );
}
