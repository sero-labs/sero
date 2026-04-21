import { shell, type BrowserWindow, type WebPreferences } from 'electron';

interface SetupMainWindowSecurityOptions {
  isDevelopment: boolean;
}

const ALLOWED_PERMISSIONS = new Set(['media', 'clipboard-sanitized-write']);

export const MCP_AUTH_WEBVIEW_PARTITION = 'persist:sero-mcp-auth';

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

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    hardenMainWindowWebviewPreferences(webPreferences);

    const src = typeof params.src === 'string' ? params.src : '';
    // The renderer must opt into the dedicated MCP auth partition explicitly.
    // Once accepted, we still force the hardened partition here so the final
    // webview prefs cannot be swapped by renderer-controlled attributes.
    const partition = typeof params.partition === 'string' ? params.partition : '';
    if (!isAllowedMainWindowWebview(src, partition)) {
      console.warn(`[security] Blocked webview attachment for ${src || '<missing src>'}`);
      event.preventDefault();
      return;
    }

    webPreferences.partition = MCP_AUTH_WEBVIEW_PARTITION;
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

export function hardenMainWindowWebviewPreferences(webPreferences: WebPreferences): void {
  const mutablePreferences = webPreferences as WebPreferences & {
    preload?: string;
    preloadURL?: string;
  };

  delete mutablePreferences.preload;
  delete mutablePreferences.preloadURL;
  mutablePreferences.nodeIntegration = false;
  mutablePreferences.nodeIntegrationInSubFrames = false;
  mutablePreferences.contextIsolation = true;
  mutablePreferences.allowRunningInsecureContent = false;
  mutablePreferences.webSecurity = true;
  mutablePreferences.sandbox = true;
  mutablePreferences.javascript = true;
  mutablePreferences.partition = MCP_AUTH_WEBVIEW_PARTITION;
}

export function isAllowedMainWindowWebview(src: string, partition: string): boolean {
  if (partition !== MCP_AUTH_WEBVIEW_PARTITION) {
    return false;
  }

  try {
    const parsed = new URL(src);
    if (isLoopbackCallbackUrl(parsed)) {
      return true;
    }
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLoopbackCallbackUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
}
