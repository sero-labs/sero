/**
 * Shared browser types — used by the main process, preload bridge and
 * renderer store. Kept renderer-safe (no Electron imports).
 */

export interface BrowserTab {
  id: string;
  /** Workspace this tab belongs to. Cookies/sessions are isolated per workspace. */
  workspaceId: string;
  url: string;
  /** Page title (defaults to URL until the page loads). */
  title: string;
  /** Data-URI favicon if the page provides one. */
  favicon?: string;
  /** True while the tab's page is loading. */
  isLoading: boolean;
  /** Back/forward button availability, mirrored from WebContents. */
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserBookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
}

export interface BrowserViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Events emitted by the main-process view manager to the renderer so the
 * store can keep tab metadata in sync with what the WebContentsView reports.
 */
/**
 * Events pushed from the main-process view manager. Every event carries the
 * owning `workspaceId` so the renderer can route it correctly even when the
 * user has switched workspaces between emission and delivery.
 */
export type BrowserEvent =
  | { tabId: string; workspaceId: string; kind: 'did-navigate'; url: string; canGoBack: boolean; canGoForward: boolean }
  | { tabId: string; workspaceId: string; kind: 'did-start-loading' }
  | { tabId: string; workspaceId: string; kind: 'did-stop-loading' }
  | { tabId: string; workspaceId: string; kind: 'title-updated'; title: string }
  | { tabId: string; workspaceId: string; kind: 'favicon-updated'; favicon: string | undefined }
  | { tabId: string; workspaceId: string; kind: 'did-fail-load'; errorDescription: string }
  /** Renderer should open a new tab (triggered by window.open / target=_blank). */
  | { tabId: string; workspaceId: string; kind: 'new-tab-request'; url: string }
  /** User picked "Add to Sero Chat" from the page's context menu. */
  | { tabId: string; workspaceId: string; kind: 'selection-to-chat'; selection: string; pageUrl: string; pageTitle: string }
  /** User picked "Save to Memory" from the page's context menu. */
  | { tabId: string; workspaceId: string; kind: 'selection-to-memory'; selection: string; pageUrl: string; pageTitle: string }
  /** A new tab was opened by the host (CLI bridge, agent). Renderer store should mirror it. */
  | { tabId: string; workspaceId: string; kind: 'host-tab-opened'; url: string }
  /** A tab was closed by the host. Renderer store should remove it. */
  | { tabId: string; workspaceId: string; kind: 'host-tab-closed' };

/** Default home page for a new empty tab. */
export const BROWSER_HOME_URL = 'https://duckduckgo.com/';

/**
 * Turn a user-typed string into a URL.
 *
 * - Obvious URLs (contain `://` or a dot + no spaces) → used as-is.
 * - Anything else → DuckDuckGo search query. DuckDuckGo was chosen over
 *   Google because it serves a clean results page to headless/embedded
 *   browsers without CAPTCHA walls, which matters for agent-driven flows.
 */
export function resolveAddressBarInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return BROWSER_HOME_URL;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  // Looks like a bare host (has a dot, no spaces, no path-like characters)
  if (/^[^\s]+\.[^\s]+$/.test(trimmed) && !/\s/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}
