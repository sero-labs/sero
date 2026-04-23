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

import { BrowserWindow, WebContentsView, shell, session } from 'electron';
import type { WebContents } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { BrowserEvent, BrowserViewBounds } from '@/types/browser';
import { showBrowserContextMenu } from './context-menu';

const BROWSER_PARTITION_PREFIX = 'persist:sero-browser';

/**
 * Compute the persistent session partition for a workspace. Workspace ids
 * are kebab-case slugs already, so they're safe to embed in a partition
 * string directly — but we still strip anything unexpected defensively.
 */
function partitionFor(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'global';
  return `${BROWSER_PARTITION_PREFIX}:${safe}`;
}

/** Position used to "hide" a view without destroying it. */
const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 } as const;

/** Public snapshot of a loaded tab, returned by listLoadedTabs. */
export interface LoadedTabInfo {
  id: string;
  workspaceId: string;
  url: string;
  title: string;
  isActive: boolean;
}

class BrowserViewManager {
  private window: BrowserWindow | null = null;
  private readonly views = new Map<string, WebContentsView>();
  /** Tracks the workspace each view belongs to (mirror of wireViewEvents closure). */
  private readonly viewWorkspaces = new Map<string, string>();
  /** Most-recently-activated tab per workspace, updated by setActive. */
  private readonly lastActivePerWorkspace = new Map<string, string>();
  private activeTabId: string | null = null;
  private currentBounds: BrowserViewBounds = { ...HIDDEN_BOUNDS };

  setWindow(window: BrowserWindow): void {
    this.window = window;
    window.on('closed', () => {
      // Views are destroyed with the window; just drop our refs.
      this.views.clear();
      this.viewWorkspaces.clear();
      this.lastActivePerWorkspace.clear();
      this.window = null;
      this.activeTabId = null;
    });
  }

  /**
   * Create a view for a tab id and load the URL. If the tab already exists,
   * navigate the existing view (idempotent for startup rehydration).
   */
  openTab(tabId: string, url: string, workspaceId: string): void {
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

    const partition = partitionFor(workspaceId);
    const view = new WebContentsView({
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.wireViewEvents(tabId, view, workspaceId);

    // Use a clean Chrome UA (strip "Electron/<version>") so sites don't
    // treat us as an embedded browser and block Widevine / logins.
    try {
      const cleanUA = session
        .fromPartition(partition)
        .getUserAgent()
        .replace(/\sElectron\/[\S]+/, '')
        .replace(/\s+sero\/[\S]+/i, '');
      view.webContents.setUserAgent(cleanUA);
    } catch {
      // getUserAgent can throw before any page has loaded on some platforms.
    }

    this.views.set(tabId, view);
    this.viewWorkspaces.set(tabId, workspaceId);

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
    const workspaceId = this.viewWorkspaces.get(tabId);
    this.views.delete(tabId);
    this.viewWorkspaces.delete(tabId);
    if (workspaceId && this.lastActivePerWorkspace.get(workspaceId) === tabId) {
      this.lastActivePerWorkspace.delete(workspaceId);
    }
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
    if (tabId) {
      const workspaceId = this.viewWorkspaces.get(tabId);
      if (workspaceId) this.lastActivePerWorkspace.set(workspaceId, tabId);
    }
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

  /**
   * Run a cleanup script in the tab and return the page's title + plain
   * text. We do the extraction inside the page so we have a real DOM; the
   * main process has none without jsdom. Readability-quality markdown is
   * a deliberate non-goal for v1 — this gets ~90% of the value with a
   * fraction of the code.
   */
  async extractPage(
    tabId: string,
  ): Promise<{ title: string; url: string; text: string } | null> {
    const wc = this.views.get(tabId)?.webContents;
    if (!wc) return null;
    const script = `(() => {
      try {
        const title = document.title || '';
        const url = location.href;
        const body = document.body ? document.body.cloneNode(true) : null;
        if (!body) return { title, url, text: '' };
        const drop = ['script','style','noscript','nav','header','footer','aside','iframe','svg','canvas','form'];
        for (const sel of drop) {
          for (const el of body.querySelectorAll(sel)) el.remove();
        }
        // innerText is better than textContent — respects visibility and block breaks.
        const raw = body.innerText || '';
        const text = raw
          .split('\\n')
          .map((l) => l.trim())
          .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
          .join('\\n')
          .trim();
        return { title, url, text };
      } catch (err) {
        return { title: document.title || '', url: location.href, text: '' };
      }
    })()`;
    try {
      const result = await wc.executeJavaScript(script, true);
      if (!result || typeof result !== 'object') return null;
      return result as { title: string; url: string; text: string };
    } catch (err) {
      console.warn('[browser] extractPage failed:', err);
      return null;
    }
  }

  /**
   * Open a new tab from the host (CLI bridge, agent tools). Assigns a
   * fresh id, creates the view, and emits `host-tab-opened` so the
   * renderer store mirrors it in its tab list. Returns the new tab id.
   */
  openTabForHost(url: string, workspaceId: string): string {
    const tabId = `tab_host_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.openTab(tabId, url, workspaceId);
    this.emit({ tabId, workspaceId, kind: 'host-tab-opened', url });
    return tabId;
  }

  /**
   * Close a tab from the host. Emits `host-tab-closed` so the renderer
   * store removes its entry. Returns false if the tab is unknown.
   */
  closeTabForHost(tabId: string): boolean {
    const workspaceId = this.viewWorkspaces.get(tabId);
    if (!workspaceId) return false;
    this.closeTab(tabId);
    this.emit({ tabId, workspaceId, kind: 'host-tab-closed' });
    return true;
  }

  /** Snapshot of currently-loaded tabs, optionally filtered by workspace. */
  listLoadedTabs(workspaceId?: string): LoadedTabInfo[] {
    const out: LoadedTabInfo[] = [];
    for (const [id, view] of this.views) {
      const ws = this.viewWorkspaces.get(id) ?? 'global';
      if (workspaceId && ws !== workspaceId) continue;
      const wc = view.webContents;
      out.push({
        id,
        workspaceId: ws,
        url: wc.getURL(),
        title: wc.getTitle(),
        isActive: this.lastActivePerWorkspace.get(ws) === id,
      });
    }
    return out;
  }

  /** Most-recently-activated tab id for a workspace, or null. */
  resolveActiveTabForWorkspace(workspaceId: string): string | null {
    return this.lastActivePerWorkspace.get(workspaceId) ?? null;
  }

  /** Whether a given tab id exists as a loaded WebContentsView. */
  hasTab(tabId: string): boolean {
    return this.views.has(tabId);
  }

  /** Workspace a tab belongs to, or null if unknown. */
  workspaceForTab(tabId: string): string | null {
    return this.viewWorkspaces.get(tabId) ?? null;
  }

  /**
   * Capture the tab as a PNG. Returns a base64 string (no data URI prefix).
   * The optional rect is in CSS pixels relative to the view's top-left.
   */
  async capturePage(
    tabId: string,
    rect?: { x: number; y: number; width: number; height: number },
  ): Promise<string | null> {
    const wc = this.views.get(tabId)?.webContents;
    if (!wc) return null;
    try {
      const image = rect ? await wc.capturePage(rect) : await wc.capturePage();
      return image.toPNG().toString('base64');
    } catch (err) {
      console.warn('[browser] capturePage failed:', err);
      return null;
    }
  }

  private wireViewEvents(tabId: string, view: WebContentsView, workspaceId: string): void {
    const wc = view.webContents;

    // Security: open new windows (target=_blank, window.open) as new tabs
    // within Sero rather than spawning OS browser windows. New tab stays
    // on the same workspace as the opener.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url) || /^about:blank$/i.test(url)) {
        this.emit({ tabId, workspaceId, kind: 'new-tab-request', url });
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
      this.emit({ tabId, workspaceId, kind: 'did-start-loading' });
    });
    wc.on('did-stop-loading', () => {
      this.emit({ tabId, workspaceId, kind: 'did-stop-loading' });
    });
    wc.on('did-navigate', (_e, url) => {
      this.emit({
        tabId,
        workspaceId,
        kind: 'did-navigate',
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });
    wc.on('did-navigate-in-page', (_e, url) => {
      this.emit({
        tabId,
        workspaceId,
        kind: 'did-navigate',
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });
    wc.on('page-title-updated', (_e, title) => {
      this.emit({ tabId, workspaceId, kind: 'title-updated', title });
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.emit({ tabId, workspaceId, kind: 'favicon-updated', favicon: favicons[0] });
    });
    wc.on('did-fail-load', (_e, _code, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame) return;
      this.emit({ tabId, workspaceId, kind: 'did-fail-load', errorDescription });
    });

    // The WebContentsView has no built-in chrome — we own the context menu.
    wc.on('context-menu', (_e, params) => {
      showBrowserContextMenu({
        tabId,
        workspaceId,
        view,
        params,
        window: this.window,
        emit: (event) => this.emit(event),
      });
    });
  }

  private emit(event: BrowserEvent): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    win.webContents.send(IpcChannels.browser.event, event);
  }
}

export const browserViewManager = new BrowserViewManager();
