import { BrowserWindow, WebContentsView, shell, session } from 'electron';
import type { WebContents } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { BrowserEvent, BrowserViewBounds } from '@/types/browser';
import { BROWSER_HOME_URL } from '@/types/browser';
import { showBrowserContextMenu } from './context-menu';
import { buildExtractPageScript, buildScrollPageScript } from './page-scripts';

const BROWSER_PARTITION_PREFIX = 'persist:sero-browser';
const ALLOWED_BROWSER_PROTOCOLS = new Set(['http:', 'https:']);

function normalizeBrowserUrl(raw: string): string | null {
  if (raw === 'about:blank') return raw;
  try {
    const parsed = new URL(raw);
    if (!ALLOWED_BROWSER_PROTOCOLS.has(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function partitionFor(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'global';
  return `${BROWSER_PARTITION_PREFIX}:${safe}`;
}

const HIDDEN_BOUNDS = { x: 0, y: 0, width: 0, height: 0 } as const;

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
  private readonly viewWorkspaces = new Map<string, string>();
  private readonly lastActivePerWorkspace = new Map<string, string>();
  private activeTabId: string | null = null;
  private currentBounds: BrowserViewBounds = { ...HIDDEN_BOUNDS };

  setWindow(window: BrowserWindow): void {
    this.window = window;
    window.webContents.on('did-start-loading', () => {
      this.hideAll();
    });
    window.on('closed', () => {
      this.views.clear();
      this.viewWorkspaces.clear();
      this.lastActivePerWorkspace.clear();
      this.window = null;
      this.activeTabId = null;
    });
  }

  openTab(tabId: string, url: string, workspaceId: string): void {
    if (!this.window) return;
    const safeUrl = normalizeBrowserUrl(url);
    if (!safeUrl) {
      console.warn(`[browser] Refusing to load unsupported URL: ${url}`);
      return;
    }
    const existing = this.views.get(tabId);
    if (existing) {
      if (existing.webContents.getURL() !== safeUrl) {
        void existing.webContents.loadURL(safeUrl).catch(() => {
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

    void view.webContents.loadURL(safeUrl).catch(() => {
      // see above
    });
  }

  closeTab(tabId: string, workspaceId: string): void {
    if (!this.ownsTab(tabId, workspaceId, 'closeTab')) return;
    const view = this.views.get(tabId);
    if (!view) return;
    this.views.delete(tabId);
    this.viewWorkspaces.delete(tabId);
    if (this.lastActivePerWorkspace.get(workspaceId) === tabId) {
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

  /**
   * Show the given tab's view at the current panel bounds, hide all others.
   * Pass `tabId = null` (and the caller's workspace) to deactivate.
   */
  setActive(tabId: string | null, workspaceId: string): void {
    if (tabId && !this.ownsTab(tabId, workspaceId, 'setActive')) return;
    this.activeTabId = tabId;
    if (tabId) {
      this.lastActivePerWorkspace.set(workspaceId, tabId);
      this.emit({ tabId, workspaceId, kind: 'host-tab-activated' });
    } else {
      this.lastActivePerWorkspace.delete(workspaceId);
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

  navigate(tabId: string, url: string, workspaceId: string): void {
    if (!this.ownsTab(tabId, workspaceId, 'navigate')) return;
    const safeUrl = normalizeBrowserUrl(url);
    if (!safeUrl) {
      console.warn(`[browser] Refusing to navigate to unsupported URL: ${url}`);
      return;
    }
    const view = this.views.get(tabId);
    if (!view) return;
    void view.webContents.loadURL(safeUrl).catch(() => {
      // surfaced via did-fail-load
    });
  }

  goBack(tabId: string, workspaceId: string): void {
    if (!this.ownsTab(tabId, workspaceId, 'goBack')) return;
    const wc = this.views.get(tabId)?.webContents;
    if (wc?.navigationHistory?.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(tabId: string, workspaceId: string): void {
    if (!this.ownsTab(tabId, workspaceId, 'goForward')) return;
    const wc = this.views.get(tabId)?.webContents;
    if (wc?.navigationHistory?.canGoForward()) wc.navigationHistory.goForward();
  }

  reload(tabId: string, workspaceId: string): void {
    if (!this.ownsTab(tabId, workspaceId, 'reload')) return;
    this.views.get(tabId)?.webContents.reload();
  }

  stop(tabId: string, workspaceId: string): void {
    if (!this.ownsTab(tabId, workspaceId, 'stop')) return;
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
    workspaceId: string,
  ): Promise<{ title: string; url: string; text: string } | null> {
    if (!this.ownsTab(tabId, workspaceId, 'extractPage')) return null;
    const wc = this.views.get(tabId)?.webContents;
    if (!wc) return null;
    const script = buildExtractPageScript();
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
  openTabForHost(url: string, workspaceId: string): string | null {
    const safeUrl = normalizeBrowserUrl(url);
    if (!safeUrl) return null;
    const tabId = `tab_host_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.openTab(tabId, safeUrl, workspaceId);
    this.setActive(tabId, workspaceId);
    this.emit({ tabId, workspaceId, kind: 'host-tab-opened', url: safeUrl });
    return tabId;
  }

  /**
   * Close a tab from the host. Validates that the tab belongs to the
   * caller's workspace, then emits `host-tab-closed` so the renderer
   * store removes its entry. Returns false if the tab is unknown or
   * belongs to a different workspace.
   */
  closeTabForHost(tabId: string, workspaceId: string): boolean {
    if (!this.ownsTab(tabId, workspaceId, 'closeTabForHost')) return false;
    this.closeTab(tabId, workspaceId);
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

  private activateByOffset(workspaceId: string, delta: number): void {
    const tabs = this.listLoadedTabs(workspaceId);
    if (tabs.length === 0) return;
    const activeId = this.resolveActiveTabForWorkspace(workspaceId);
    const index = tabs.findIndex((tab) => tab.id === activeId);
    const next = index < 0 ? 0 : ((index + delta) % tabs.length + tabs.length) % tabs.length;
    this.setActive(tabs[next].id, workspaceId);
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
   * Authorization gate for every tab-scoped operation. Returns true iff
   * `tabId` exists and belongs to `workspaceId`. Mismatches are logged —
   * they indicate either a renderer bug or a tampered IPC call and should
   * never happen in normal use.
   */
  private ownsTab(tabId: string, workspaceId: string, op: string): boolean {
    const owner = this.viewWorkspaces.get(tabId);
    if (!owner) {
      // Unknown tab — operation silently dropped. Not logged because this
      // fires normally during race conditions (e.g. close + late reload).
      return false;
    }
    if (owner !== workspaceId) {
      console.warn(
        `[browser] ${op}: tab ${tabId} belongs to workspace "${owner}" but ` +
          `caller claimed "${workspaceId}" — rejecting.`,
      );
      return false;
    }
    return true;
  }

  async scrollPage(
    tabId: string,
    workspaceId: string,
    amount: number,
  ): Promise<{ scrollX: number; scrollY: number; maxY: number } | null> {
    if (!this.ownsTab(tabId, workspaceId, 'scrollPage')) return null;
    const wc = this.views.get(tabId)?.webContents;
    if (!wc) return null;
    const script = buildScrollPageScript(amount);
    try {
      const result = await wc.executeJavaScript(script, true);
      if (!result || typeof result !== 'object') return null;
      return result as { scrollX: number; scrollY: number; maxY: number };
    } catch (err) {
      console.warn('[browser] scrollPage failed:', err);
      return null;
    }
  }

  /**
   * Capture the tab as a PNG. Returns a base64 string (no data URI prefix).
   * The optional rect is in CSS pixels relative to the view's top-left.
   */
  async capturePage(
    tabId: string,
    workspaceId: string,
    rect?: { x: number; y: number; width: number; height: number },
  ): Promise<string | null> {
    if (!this.ownsTab(tabId, workspaceId, 'capturePage')) return null;
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

    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || (!input.meta && !input.control) || input.alt) return;
      const key = input.key.toLowerCase();
      const loaded = this.listLoadedTabs(workspaceId);
      const activeId = this.resolveActiveTabForWorkspace(workspaceId) ?? tabId;
      const activeView = this.views.get(activeId);

      if (input.shift && (key === '[' || key === ']')) {
        event.preventDefault();
        this.activateByOffset(workspaceId, key === '[' ? -1 : 1);
        return;
      }
      if (input.shift) return;

      if (/^[1-9]$/.test(key)) {
        event.preventDefault();
        const index = key === '9' ? loaded.length - 1 : Number(key) - 1;
        const target = loaded[index];
        if (target) this.setActive(target.id, workspaceId);
        return;
      }

      switch (key) {
        case 't':
          event.preventDefault();
          this.openTabForHost(BROWSER_HOME_URL, workspaceId);
          return;
        case 'w':
          event.preventDefault();
          this.closeTabForHost(activeId, workspaceId);
          return;
        case 'r':
          event.preventDefault();
          activeView?.webContents.reload();
          return;
        case '[':
          if (activeView?.webContents.navigationHistory.canGoBack()) {
            event.preventDefault();
            activeView.webContents.navigationHistory.goBack();
          }
          return;
        case ']':
          if (activeView?.webContents.navigationHistory.canGoForward()) {
            event.preventDefault();
            activeView.webContents.navigationHistory.goForward();
          }
          return;
      }
    });

    // Security: open new windows (target=_blank, window.open) as new tabs
    // within Sero rather than spawning OS browser windows. New tab stays
    // on the same workspace as the opener.
    wc.setWindowOpenHandler(({ url }) => {
      const safeUrl = normalizeBrowserUrl(url);
      if (safeUrl) {
        this.emit({ tabId, workspaceId, kind: 'new-tab-request', url: safeUrl });
      } else if (/^(mailto|tel):/i.test(url)) {
        void shell.openExternal(url).catch(() => undefined);
      }
      return { action: 'deny' };
    });

    // Block file:// and other local-filesystem navigations inside the view.
    wc.on('will-navigate', (event, navigationUrl) => {
      if (!normalizeBrowserUrl(navigationUrl)) {
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
