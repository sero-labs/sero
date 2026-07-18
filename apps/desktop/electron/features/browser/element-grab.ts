/**
 * React-grab element picking inside browser tabs.
 *
 * The react-grab IIFE bundle (staged next to the main bundle by
 * build-electron.mjs) is injected into the page on first use, then driven
 * through its `window.__REACT_GRAB__` API. A pick resolves through a
 * page-side promise that settles when the user grabs an element (click /
 * Cmd+C) or cancels (Escape) — push-based, no polling.
 *
 * Scripts below follow the same escaping rules as page-scripts.ts: they are
 * serialized before the page parses them, so keep string literals and
 * comments free of escape sequences and stray quotes.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { WebContents } from 'electron';
import type { BrowserGrabResult } from '@/types/browser';

let cachedBundle: string | null = null;

/** Also used by the gateway to build the dev-server preview grab script. */
export function loadReactGrabBundle(): string {
  cachedBundle ??= fs.readFileSync(path.join(__dirname, 'react-grab.global.js'), 'utf8');
  return cachedBundle;
}

/**
 * Load react-grab into the page and init it under our control. The bundle
 * must run at top level: it publishes its module namespace via `this`,
 * which only points at `window` in sloppy top-level code. Setting
 * `__REACT_GRAB_DISABLED__` first suppresses its auto-init so we can init
 * with telemetry off; the `sero-grab-host` plugin hides react-grab's own
 * floating toolbar (we only expose picking through the Sero toolbar).
 * If the page already ships react-grab (a dev app using it), we reuse the
 * page's instance untouched.
 */
function buildInjectScript(): string {
  return [
    'window.__REACT_GRAB_DISABLED__ = true;',
    loadReactGrabBundle(),
    `;(() => {
      if (window.__REACT_GRAB__) return true;
      const mod = globalThis.__REACT_GRAB_MODULE__;
      if (!mod || typeof mod.init !== 'function') return false;
      const api = mod.init({ telemetry: false });
      mod.setGlobalApi(api);
      api.registerPlugin({ name: 'sero-grab-host', theme: { toolbar: { enabled: false } } });
      return Boolean(window.__REACT_GRAB__);
    })();`,
  ].join('\n');
}

/**
 * Activate the picker and return a promise that settles with the grab
 * outcome. The bridge plugin resolves through `__SERO_GRAB_RESOLVE__` so a
 * cancel script (or Escape via react-grab's own deactivation) can settle
 * the same pick. `onCopySuccess` receives the exact agent-ready context
 * string react-grab puts on the clipboard.
 */
function buildStartPickScript(): string {
  return `(() => {
    const api = window.__REACT_GRAB__;
    if (!api) return { status: 'unavailable' };
    if (window.__SERO_GRAB_RESOLVE__) return { status: 'unavailable' };
    const settle = (result) => {
      const resolve = window.__SERO_GRAB_RESOLVE__;
      window.__SERO_GRAB_RESOLVE__ = null;
      if (resolve) resolve(result);
    };
    if (!api.getPlugins().includes('sero-grab-bridge')) {
      api.registerPlugin({
        name: 'sero-grab-bridge',
        hooks: {
          onCopySuccess: (elements, content) => settle({ status: 'grabbed', content }),
          onDeactivate: () => settle({ status: 'cancelled' }),
        },
      });
    }
    return new Promise((resolve) => {
      window.__SERO_GRAB_RESOLVE__ = resolve;
      api.activate();
    });
  })()`;
}

/**
 * Cancel a pending pick. Deactivating settles the pick via the bridge
 * plugin's onDeactivate; the direct settle covers the defensive case where
 * a resolver is pending but the picker is no longer active.
 */
function buildCancelPickScript(): string {
  return `(() => {
    const api = window.__REACT_GRAB__;
    if (api && api.isActive()) {
      api.deactivate();
      return;
    }
    const resolve = window.__SERO_GRAB_RESOLVE__;
    window.__SERO_GRAB_RESOLVE__ = null;
    if (resolve) resolve({ status: 'cancelled' });
  })()`;
}

function isGrabResult(value: unknown): value is BrowserGrabResult {
  if (!value || typeof value !== 'object') return false;
  const status = (value as { status?: unknown }).status;
  return status === 'grabbed' || status === 'cancelled' || status === 'unavailable';
}

/** Inject react-grab (once per page load) and run a pick to completion. */
export async function grabElementInPage(wc: WebContents): Promise<BrowserGrabResult> {
  try {
    const present = await wc.executeJavaScript('Boolean(window.__REACT_GRAB__)', true);
    if (!present) {
      const injected = await wc.executeJavaScript(buildInjectScript(), true);
      if (injected !== true) return { status: 'unavailable' };
    }
  } catch (err) {
    console.warn('[browser] react-grab injection failed:', err);
    return { status: 'unavailable' };
  }

  // The page-side promise dies silently if the page navigates away or the
  // tab is closed, so race it against teardown events.
  let onGone: () => void = () => {};
  const gone = new Promise<null>((resolve) => {
    onGone = () => resolve(null);
    wc.on('did-navigate', onGone);
    wc.on('destroyed', onGone);
  });
  const result = await Promise.race([
    wc.executeJavaScript(buildStartPickScript(), true).catch(() => null),
    gone,
  ]);
  wc.off('did-navigate', onGone);
  wc.off('destroyed', onGone);
  return isGrabResult(result) ? result : { status: 'cancelled' };
}

/** Cancel an in-flight pick (toolbar toggle-off). */
export function cancelGrabInPage(wc: WebContents): void {
  void wc.executeJavaScript(buildCancelPickScript(), true).catch(() => undefined);
}
