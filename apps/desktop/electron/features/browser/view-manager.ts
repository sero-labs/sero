/**
 * Main-process manager for the in-app web browser.
 *
 * One WebContentsView is created per tab and stacked as a child of the
 * main window's contentView. Only the active tab's view is placed at the
 * panel rect — all others are parked off-screen (width/height = 0) so they
 * keep running (audio, timers) but don't render.
 *
 * Why WebContentsView over <webview>:
 *   - no CSP `frame-src` headaches (it's a native sibling, not an iframe)
 *   - main-process controls navigation lifecycle + security
 *   - renderer can't spoof webPreferences via attributes
 *
 * Views are torn down when:
 *   - `closeTab` is invoked
 *   - the main window is closed (each view's wc is destroyed with the parent)
 */

import { BrowserWindow, Menu, WebContentsView, clipboard, shell, session } from 'electron';
import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { BrowserEvent, BrowserViewBounds } from '@/types/browser';

const BROWSER_PARTITION = 'persist:sero-browser';

/** Position used to "hide" a view without destroying it. */
const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 } as const;

class BrowserViewManager {
  private window: BrowserWindow | null = null;
  private readonly views = new Map<string, WebContentsView>();
  private activeTabId: string | null = null;
  private currentBounds: BrowserViewBounds = { ...HIDDEN_BOUNDS };

  setWindow(window: BrowserWindow): void {
    this.window = window;
    window.on('closed', () => {
      // Views are destroyed with the window; just drop our refs.
      this.views.clear();
      this.window = null;
      this.activeTabId = null;
    });
  }

  /**
   * Create a view for a tab id and load the URL. If the tab already exists,
   * navigate the existing view (idempotent for startup rehydration).
   */
  openTab(tabId: string, url: string): void {
    if (!this.window) return;
    const existing = this.views.get(tabId);
    if (existing) {
      if (existing.webContents.getURL() !== url) {
        void existing.webContents.loadURL(url).catch(() => {
          // Navigation errors surface via did-fail-load; ignore the promise rejection.
        });
      }
      return;
    }

    const view = new WebContentsView({
      webPreferences: {
        partition: BROWSER_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.wireViewEvents(tabId, view);

    // Use a clean Chrome UA (strip "Electron/<version>") so sites don't
    // treat us as an embedded browser and block Widevine / logins.
    try {
      const cleanUA = session
        .fromPartition(BROWSER_PARTITION)
        .getUserAgent()
        .replace(/\sElectron\/[\S]+/, '')
        .replace(/\s+sero\/[\S]+/i, '');
      view.webContents.setUserAgent(cleanUA);
    } catch {
      // getUserAgent can throw before any page has loaded on some platforms.
    }

    this.views.set(tabId, view);

    // Park off-screen until explicitly shown. addChildView places it on top,
    // but zero-size bounds keep it invisible.
    view.setBounds({ ...HIDDEN_BOUNDS });
    this.window.contentView.addChildView(view);

    void view.webContents.loadURL(url).catch(() => {
      // see above
    });
  }

  closeTab(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    this.views.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }
    // Electron's type defs don't expose WebContents.destroy(), but the method
    // exists at runtime and is the only way to free the underlying process.
    const wc = view.webContents as WebContents & { destroy?: () => void };
    wc.destroy?.();
  }

  /** Show the given tab's view at the current panel bounds, hide all others. */
  setActive(tabId: string | null): void {
    this.activeTabId = tabId;
    for (const [id, view] of this.views) {
      if (id === tabId) {
        view.setBounds(this.currentBounds);
      } else {
        view.setBounds({ ...HIDDEN_BOUNDS });
      }
    }
  }

  /** Update the rect where the active view should be rendered. */
  setBounds(bounds: BrowserViewBounds): void {
    this.currentBounds = bounds;
    if (!this.activeTabId) return;
    const view = this.views.get(this.activeTabId);
    if (view) view.setBounds(bounds);
  }

  /** Park every view off-screen (panel hidden / switched away). */
  hideAll(): void {
    this.currentBounds = { ...HIDDEN_BOUNDS };
    for (const view of this.views.values()) {
      view.setBounds({ ...HIDDEN_BOUNDS });
    }
  }

  navigate(tabId: string, url: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    void view.webContents.loadURL(url).catch(() => {
      // surfaced via did-fail-load
    });
  }

  goBack(tabId: string): void {
    const wc = this.views.get(tabId)?.webContents;
    if (wc?.navigationHistory?.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(tabId: string): void {
    const wc = this.views.get(tabId)?.webContents;
    if (wc?.navigationHistory?.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(tabId: string): void {
    this.views.get(tabId)?.webContents.reload();
  }

  stop(tabId: string): void {
    this.views.get(tabId)?.webContents.stop();
  }

  private wireViewEvents(tabId: string, view: WebContentsView): void {
    const wc = view.webContents;

    // Security: open new windows (target=_blank, window.open) as new tabs
    // within Sero rather than spawning OS browser windows.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url) || /^about:blank$/i.test(url)) {
        this.emit({ tabId, kind: 'new-tab-request', url });
      } else {
        // Hand off exotic schemes (mailto:, tel:, …) to the OS.
        void shell.openExternal(url).catch(() => undefined);
      }
      return { action: 'deny' };
    });

    // Block file:// and other local-filesystem navigations inside the view.
    wc.on('will-navigate', (event, navigationUrl) => {
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.protocol === 'file:') {
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });

    wc.on('did-start-loading', () => {
      this.emit({ tabId, kind: 'did-start-loading' });
    });
    wc.on('did-stop-loading', () => {
      this.emit({ tabId, kind: 'did-stop-loading' });
    });
    wc.on('did-navigate', (_e, url) => {
      this.emit({
        tabId,
        kind: 'did-navigate',
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });
    wc.on('did-navigate-in-page', (_e, url) => {
      this.emit({
        tabId,
        kind: 'did-navigate',
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });
    wc.on('page-title-updated', (_e, title) => {
      this.emit({ tabId, kind: 'title-updated', title });
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.emit({ tabId, kind: 'favicon-updated', favicon: favicons[0] });
    });
    wc.on('did-fail-load', (_e, _code, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame) return;
      this.emit({ tabId, kind: 'did-fail-load', errorDescription });
    });

    // The WebContentsView has no built-in chrome — we own the context menu.
    wc.on('context-menu', (_e, params) => {
      this.showContextMenu(tabId, view, params);
    });
  }

  private showContextMenu(
    tabId: string,
    view: WebContentsView,
    params: ContextMenuParams,
  ): void {
    const wc = view.webContents;
    const items: MenuItemConstructorOptions[] = [];

    if (params.selectionText && params.selectionText.trim()) {
      items.push({
        label: 'Add to Sero Chat',
        click: () => {
          this.emit({
            tabId,
            kind: 'selection-to-chat',
            selection: params.selectionText,
            pageUrl: wc.getURL(),
            pageTitle: wc.getTitle(),
          });
        },
      });
      items.push({ type: 'separator' });
      items.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
    }

    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: 'Open Link in New Tab',
        click: () => {
          this.emit({ tabId, kind: 'new-tab-request', url: params.linkURL });
        },
      });
      items.push({
        label: 'Copy Link Address',
        click: () => clipboard.writeText(params.linkURL),
      });
    }

    if (params.srcURL && params.mediaType === 'image') {
      if (items.length) items.push({ type: 'separator' });
      items.push({
        label: 'Open Image in New Tab',
        click: () => {
          this.emit({ tabId, kind: 'new-tab-request', url: params.srcURL });
        },
      });
      items.push({
        label: 'Copy Image Address',
        click: () => clipboard.writeText(params.srcURL),
      });
    }

    if (params.isEditable) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut });
      items.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
      items.push({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste });
      items.push({ label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll });
    }

    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Back',
      enabled: wc.navigationHistory.canGoBack(),
      click: () => wc.navigationHistory.goBack(),
    });
    items.push({
      label: 'Forward',
      enabled: wc.navigationHistory.canGoForward(),
      click: () => wc.navigationHistory.goForward(),
    });
    items.push({ label: 'Reload', click: () => wc.reload() });

    items.push({ type: 'separator' });
    items.push({
      label: 'Inspect Element',
      click: () => wc.inspectElement(params.x, params.y),
    });

    const menu = Menu.buildFromTemplate(items);
    menu.popup({ window: this.window ?? undefined });
  }

  private emit(event: BrowserEvent): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.browser.event, event);
  }
}

export const browserViewManager = new BrowserViewManager();
