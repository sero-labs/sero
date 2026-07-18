/**
 * React-grab bundle for dev-server previews. The dev proxy injects a
 * `<script src="/__sero/grab.js">` tag into proxied HTML documents; this
 * module serves that script — the react-grab IIFE plus a bootstrap that
 * bridges picks to the embedding web-remote SPA over postMessage.
 *
 * Message protocol (mirrored in apps/web-remote PreviewPanel):
 *   parent → iframe: { type: 'sero:grab-start' } | { type: 'sero:grab-cancel' }
 *   iframe → parent: { type: 'sero:grab-result', status: 'grabbed', content } |
 *                    { type: 'sero:grab-result', status: 'cancelled' }
 * The preview iframe is sandboxed without allow-same-origin, so both sides
 * post with targetOrigin '*' and validate the source window instead.
 */

import http from 'http';
import { loadReactGrabBundle } from '@electron/features/browser/element-grab';

export const GRAB_SCRIPT_PATH = '/__sero/grab.js';

let cachedScript: string | null = null;

/**
 * The bundle publishes its namespace through top-level `this`, so it must
 * run at top level of this classic script. `__REACT_GRAB_DISABLED__`
 * suppresses its auto-init; we init with telemetry off, hide react-grab's
 * floating toolbar, then clear the flag so a page that ships its own
 * react-grab copy reuses this instance instead of silently no-op'ing.
 */
function buildGrabScript(): string {
  return [
    'window.__REACT_GRAB_DISABLED__ = true;',
    loadReactGrabBundle(),
    `;(() => {
      if (window.top === window) return;
      const mod = globalThis.__REACT_GRAB_MODULE__;
      if (!mod || typeof mod.init !== 'function') return;
      if (!window.__REACT_GRAB__) {
        const api = mod.init({ telemetry: false });
        mod.setGlobalApi(api);
        api.registerPlugin({ name: 'sero-grab-host', theme: { toolbar: { enabled: false } } });
      }
      delete window.__REACT_GRAB_DISABLED__;
      const api = window.__REACT_GRAB__;
      if (!api) return;
      const post = (result) => window.parent.postMessage(result, '*');
      // Source locations come from the dev server's module URLs, which the
      // proxy has prefixed with /p/<workspace>/<port>. Strip that prefix
      // (and vite's /@fs marker) so the agent sees real file paths.
      const prefixMatch = /^\\/p\\/[^/]+\\/\\d+/.exec(location.pathname);
      const cleanPaths = (content) => {
        if (!prefixMatch) return content;
        const prefix = prefixMatch[0];
        return content.split(prefix + '/@fs').join('').split(prefix).join('');
      };
      api.registerPlugin({
        name: 'sero-grab-bridge',
        hooks: {
          onCopySuccess: (elements, content) =>
            post({ type: 'sero:grab-result', status: 'grabbed', content: cleanPaths(content) }),
          onDeactivate: () => post({ type: 'sero:grab-result', status: 'cancelled' }),
        },
      });
      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'sero:grab-start') api.activate();
        if (data.type === 'sero:grab-cancel') api.deactivate();
      });
    })();`,
  ].join('\n');
}

/** Serve the grab script for `/__sero/grab.js`; returns false otherwise. */
export function tryServeGrabScript(pathname: string, res: http.ServerResponse): boolean {
  if (pathname !== GRAB_SCRIPT_PATH) return false;
  cachedScript ??= buildGrabScript();
  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(cachedScript);
  return true;
}
