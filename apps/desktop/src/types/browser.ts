/**
 * Shared browser types — used by the main process, preload bridge and
 * renderer store. Kept renderer-safe (no Electron imports).
 */

export interface BrowserTab {
  id: string;
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
export type BrowserEvent =
  | { tabId: string; kind: 'did-navigate'; url: string; canGoBack: boolean; canGoForward: boolean }
  | { tabId: string; kind: 'did-start-loading' }
  | { tabId: string; kind: 'did-stop-loading' }
  | { tabId: string; kind: 'title-updated'; title: string }
  | { tabId: string; kind: 'favicon-updated'; favicon: string | undefined }
  | { tabId: string; kind: 'did-fail-load'; errorDescription: string }
  /** Renderer should open a new tab (triggered by window.open / target=_blank). */
  | { tabId: string; kind: 'new-tab-request'; url: string };

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
